// One permission/tracing gate for every tool the model can call, hooked on
// pi's global tool_call/tool_result events. tool_call runs before execute(), so
// the approval wait never counts toward pi's durationMs, and it also covers
// tools pi registers itself (native `mcp__*` MCP tools, nested calls).
//
// Not gated here: collaboration/planning tools — they ARE the engagement/
// workflow mechanism, not a side effect to gate. Built-in/web/agent tools get
// their `execute_tool` spans from instrumentTool (tool-wrapping.ts); only MCP
// tools are spanned here, since they bypass `customTools`.
import type {
  InlineExtension,
  ToolCallEventResult,
  ToolResultEventResult,
} from '@earendil-works/pi-coding-agent';
import { captureContent, safeAttr, SpanStatusCode, startSpan, type Span } from '../../shared/otel';
import { describeCatastrophicRm } from './catastrophic-rm-guard';
import { state } from './state';
import { send } from './transport';
import type { MsgPreToolUseRequest, MsgPreToolUseResponse } from '../agent-runtime/pi/protocol';

const MCP_TOOL_PREFIX = 'mcp__';

export const READ_ONLY_TOOL_NAMES = new Set([
  'read',
  'grep',
  'find',
  'ls',
  'web_fetch',
  'web_search',
]);

// browser_tool is deliberately excluded from the set above: click/fill/select/
// type/key/evaluate can submit forms, trigger destructive buttons, or run
// arbitrary JS against any real site the agent navigates to — treating the
// whole tool as read-only would let plan/ask mode's safety boundary be
// bypassed for remote side effects.

export interface ToolGovernanceOptions {
  /** Names of non-MCP tools that go through the permission round trip. */
  gatedToolNames: Iterable<string>;
  /**
   * Opts one tool (Bash) into the catastrophic-delete circuit breaker. Passed
   * explicitly, with the name read off the tool definition, so an upstream
   * rename can't silently disable the check.
   */
  catastrophicRm?: { toolName: string; cwd: string };
}

function requestPermission(
  toolCallId: string,
  toolName: string,
  input: unknown,
): Promise<MsgPreToolUseResponse> {
  return new Promise((resolve) => {
    const requestId = `perm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
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

// pi reads the mutated event.input after the handlers run, so a 'modify'
// decision replaces it in place (dropping keys the new input omits).
function replaceInput(target: unknown, next: unknown): void {
  if (!target || typeof target !== 'object' || !next || typeof next !== 'object') return;
  const t = target as Record<string, unknown>;
  for (const key of Object.keys(t)) delete t[key];
  Object.assign(t, next);
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

export function toolGovernanceExtension(options: ToolGovernanceOptions): InlineExtension {
  const gated = new Set([...options.gatedToolNames].map((n) => n.toLowerCase()));
  const catastrophic = options.catastrophicRm;

  return {
    name: 'minimalist-agent-tool-governance',
    hidden: true,
    factory: (pi) => {
      pi.on('tool_call', async (event): Promise<ToolCallEventResult | void> => {
        const isMcp = event.toolName.startsWith(MCP_TOOL_PREFIX);
        const name = event.toolName.toLowerCase();
        if (!isMcp && !gated.has(name)) return;

        if (isMcp) openMcpSpan(event.toolCallId, event.toolName, event.input);

        // A hard block, not an approval request: it applies in EVERY permission
        // mode including auto, so it can't route through main — auto mode
        // resolves every request there as 'allow'. A circuit breaker that could
        // be silently auto-approved isn't one.
        if (catastrophic && event.toolName === catastrophic.toolName) {
          const command = (event.input as { command?: unknown } | undefined)?.command;
          if (typeof command === 'string') {
            const reason = describeCatastrophicRm(command, catastrophic.cwd);
            if (reason) {
              return { block: true, reason: `Blocked: catastrophic delete detected — ${reason}` };
            }
          }
        }

        if (state.permissionMode === 'auto') return;
        // Every mcp__ call round-trips regardless of what the tool does; the
        // read-only exemption only covers our own known built-ins.
        if (!isMcp && READ_ONLY_TOOL_NAMES.has(name)) return;

        const decision = await requestPermission(event.toolCallId, event.toolName, event.input);
        if (decision.action === 'block') {
          return { block: true, reason: decision.reason ?? 'Tool execution denied.' };
        }
        if (decision.action === 'modify' && decision.input !== undefined) {
          replaceInput(event.input, decision.input);
        }
      });

      pi.on('tool_result', (event): ToolResultEventResult | void => {
        if (!event.toolName.startsWith(MCP_TOOL_PREFIX)) return;
        closeMcpSpan(event.toolCallId, event.isError, event.content);
      });
    },
  };
}
