// Native MCP tools are registered directly by pi's createMcpExtension, which
// bypasses the customTools wrappers (wrapWithPermissionGate, instrumentTool)
// that gate/instrument every tool this app builds itself — without this,
// MCP tool calls would silently skip plan/ask-mode approval. pi's global
// tool_call/tool_result events fire for every tool regardless of which
// extension registered it, so this hooks those for `mcp__*` names instead.
import type {
  InlineExtension,
  ToolCallEventResult,
  ToolResultEventResult,
} from '@earendil-works/pi-coding-agent';
import { captureContent, safeAttr, SpanStatusCode, startSpan, type Span } from '../../shared/otel';
import { state } from './state';
import { send } from './transport';
import type { MsgPreToolUseRequest, MsgPreToolUseResponse } from '../agent-runtime/pi/protocol';

const MCP_TOOL_PREFIX = 'mcp__';

function requestMcpPermission(
  toolCallId: string,
  toolName: string,
  input: unknown,
): Promise<MsgPreToolUseResponse> {
  return new Promise((resolve) => {
    const requestId = `mcp_perm_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    state.pendingPermission.set(requestId, { resolve });

    const req: MsgPreToolUseRequest = {
      type: 'pre_tool_use_request',
      requestId,
      turnId: state.currentTurnId ?? '',
      toolCallId,
      toolName,
      input,
    };
    send(req);

    // If the turn is aborted before main responds, auto-block so the
    // tool_call handler resolves instead of hanging forever.
    state.turnAbort?.signal.addEventListener('abort', () => {
      const pending = state.pendingPermission.get(requestId);
      if (pending) {
        state.pendingPermission.delete(requestId);
        pending.resolve({
          type: 'pre_tool_use_response',
          requestId,
          action: 'block',
          reason: 'Turn aborted',
        });
      }
    });
  });
}

// Keyed by toolCallId across the tool_call -> tool_result event pair, since
// that's the only correlation id the two events share.
const openMcpSpans = new Map<string, Span>();

function openMcpSpan(toolCallId: string, toolName: string, input: unknown): void {
  const { span } = startSpan(`execute_tool ${toolName}`, {
    attributes: {
      'gen_ai.operation.name': 'execute_tool',
      'gen_ai.tool.name': toolName,
      'gen_ai.tool.type': 'function',
      'gen_ai.tool.call.id': toolCallId,
      'gen_ai.conversation.id': state.init?.sessionId,
    },
    parentContext: state.turnContext,
  });
  if (captureContent()) {
    span.setAttribute('gen_ai.tool.call.arguments', safeAttr(input));
  }
  openMcpSpans.set(toolCallId, span);

  // tool_result won't fire if the turn aborts mid-call, so this span would
  // otherwise never close — same risk requestMcpPermission guards against
  // for pendingPermission.
  state.turnAbort?.signal.addEventListener(
    'abort',
    () => closeMcpSpan(toolCallId, true, undefined),
    { once: true },
  );
}

function closeMcpSpan(toolCallId: string, isError: boolean, content: unknown): void {
  const span = openMcpSpans.get(toolCallId);
  if (!span) return;
  openMcpSpans.delete(toolCallId);
  if (isError) {
    span.setAttribute('error.type', 'tool_error');
    span.setStatus({ code: SpanStatusCode.ERROR, message: 'tool returned isError' });
  }
  if (captureContent() && content) {
    span.setAttribute('gen_ai.tool.call.result', safeAttr(content));
  }
  span.end();
}

export function mcpGovernanceExtension(): InlineExtension {
  return {
    name: 'minimalist-agent-mcp-governance',
    hidden: true,
    factory: (pi) => {
      pi.on('tool_call', async (event): Promise<ToolCallEventResult | void> => {
        if (!event.toolName.startsWith(MCP_TOOL_PREFIX)) return;

        openMcpSpan(event.toolCallId, event.toolName, event.input);

        if (state.permissionMode === 'auto') return;

        // No read-only exemption, unlike wrapWithPermissionGate: the legacy
        // bridge wrapped every MCP tool unconditionally, so every mcp__ call
        // still round-trips here regardless of what the tool does.
        const decision = await requestMcpPermission(event.toolCallId, event.toolName, event.input);
        if (decision.action === 'block') {
          return { block: true, reason: decision.reason ?? 'Tool execution denied.' };
        }
        if (decision.action === 'modify' && decision.input !== undefined) {
          Object.assign(event.input, decision.input as Record<string, unknown>);
        }
      });

      pi.on('tool_result', (event): ToolResultEventResult | void => {
        if (!event.toolName.startsWith(MCP_TOOL_PREFIX)) return;
        closeMcpSpan(event.toolCallId, event.isError, event.content);
      });
    },
  };
}
