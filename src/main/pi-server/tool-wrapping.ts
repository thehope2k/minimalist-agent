// Wraps every builtin/web/agent/MCP tool so its execution round-trips a
// permission decision through main (in plan/ask mode) and is instrumented as
// a GenAI `execute_tool` span. Collaboration/planning tools are NOT wrapped
// here — they ARE the engagement/workflow mechanism, not a side effect to gate.
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { withOperation } from './operation-tracker';
import {
  captureContent,
  safeAttr,
  setAttrs,
  SpanStatusCode,
  withSpan,
} from '../../shared/otel';
import { describeCatastrophicRm } from './catastrophic-rm-guard';
import { state } from './state';
import { send } from './transport';
import type {
  MsgBrowserToolRequest,
  MsgBrowserToolResult,
  MsgPreToolUseRequest,
  MsgPreToolUseResponse,
} from '../agent-runtime/backends/pi/protocol';

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
// bypassed for remote side effects. It goes through the normal
// requestPermission() round-trip in plan/ask mode, same as Bash/Edit.

export function requestBrowserTool(sessionId: string, command: string): Promise<MsgBrowserToolResult> {
  return new Promise((resolve) => {
    const requestId = `browser_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    state.pendingBrowserTool.set(requestId, { resolve });
    const req: MsgBrowserToolRequest = { type: 'browser_tool_request', requestId, sessionId, command };
    send(req);

    state.turnAbort?.signal.addEventListener('abort', () => {
      const pending = state.pendingBrowserTool.get(requestId);
      if (pending) {
        state.pendingBrowserTool.delete(requestId);
        pending.resolve({ type: 'browser_tool_result', requestId, output: 'Turn aborted', isError: true });
      }
    });
  });
}

function requestPermission(
  toolCallId: string,
  toolName: string,
  input: unknown,
): Promise<MsgPreToolUseResponse> {
  return new Promise((resolve) => {
    const requestId = `pi_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    state.pendingPermission.set(requestId, { resolve });

    const turnId = state.currentTurnId ?? '';
    const req: MsgPreToolUseRequest = {
      type: 'pre_tool_use_request',
      requestId,
      turnId,
      toolCallId,
      toolName,
      input,
    };
    send(req);

    // If the turn is aborted before main responds, auto-block so the
    // tool throws instead of hanging.
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

/**
 * Wrap a Pi tool definition so its `execute` first asks main for
 * permission via `pre_tool_use_request`. Read-only tools are exempt
 * from the round-trip in `auto` mode (the gate adds latency for nothing).
 *
 * `options.catastrophicRmCwd` opts a specific call site (the Bash tool) into
 * the catastrophic-delete circuit breaker — pass it explicitly rather than
 * having this generic wrapper guess by tool name.
 */
export function wrapWithPermissionGate(
  base: ToolDefinition<any, any>,
  options?: { catastrophicRmCwd?: string },
): ToolDefinition<any, any> {
  const originalExecute = base.execute.bind(base);
  const catastrophicRmCwd = options?.catastrophicRmCwd;
  return {
    ...base,
    execute: async (toolCallId, params, signal, onUpdate, ctx) => {
      // Catastrophic-delete circuit breaker: a hard block, not an approval
      // request. It applies in EVERY permission mode, including auto, which is
      // exactly why it can't route through requestPermission()/main — that
      // path has no human-facing dialog and auto mode resolves every request
      // as 'allow' by default (see agent.ts's pre_tool_use_request handler).
      // A "circuit breaker" that could be silently auto-approved isn't one.
      //
      // Opted into by the Bash call site via `catastrophicRmCwd`, not by
      // matching `base.name` — the tool's name string is a third-party
      // library detail with no compiler link to this check, so a rename
      // upstream would silently disable a name-based match.
      if (catastrophicRmCwd) {
        const command = (params as { command?: unknown } | undefined)?.command;
        if (typeof command === 'string') {
          const reason = describeCatastrophicRm(command, catastrophicRmCwd);
          if (reason) {
            throw new Error(`Blocked: catastrophic delete detected — ${reason}`);
          }
        }
      }

      // Auto + readonly = fast path. Auto + write = also auto-allow but
      // still emit the request so main can record what happened. We
      // skip the round-trip entirely for a pure latency win.
      if (state.permissionMode === 'auto') {
        return originalExecute(toolCallId, params, signal, onUpdate, ctx);
      }

      // Read-only tools always pass even in plan/ask.
      if (READ_ONLY_TOOL_NAMES.has(base.name.toLowerCase())) {
        return originalExecute(toolCallId, params, signal, onUpdate, ctx);
      }

      const decision = await requestPermission(toolCallId, base.name, params);

      if (decision.action === 'block') {
        // Pi only marks tool_result isError when execute() throws — returning isError:true is silently ignored.
        throw new Error(decision.reason ?? 'Tool execution denied.');
      }

      const finalParams = decision.action === 'modify' ? decision.input : params;
      return originalExecute(toolCallId, finalParams, signal, onUpdate, ctx);
    },
  };
}

/**
 * Wrap a tool definition so each execution is a GenAI `execute_tool` span
 * (span name `execute_tool <name>`) nested under the active turn span. Applied
 * to every tool (builtin, web, agent, collaboration, planning) so the trace is
 * uniform. When tracing is disabled `withSpan` uses the API's no-op tracer, so
 * this is effectively free.
 */
export function instrumentTool(
  base: ToolDefinition<any, any>,
): ToolDefinition<any, any> {
  const originalExecute = base.execute.bind(base);
  // Agent delegation + collaboration/planning tools are MA-internal; the file/
  // web/bash tools are the model-callable "function" tools.
  const toolType = base.name === 'Agent' ? 'extension' : 'function';
  return {
    ...base,
    execute: (toolCallId, params, signal, onUpdate, ctx) =>
      withOperation(`tool:${base.name}`, () =>
        withSpan(
          `execute_tool ${base.name}`,
          async (span) => {
            setAttrs(span, {
              'gen_ai.operation.name': 'execute_tool',
              'gen_ai.tool.name': base.name,
              'gen_ai.tool.type': toolType,
              'gen_ai.tool.call.id': String(toolCallId),
              'gen_ai.tool.description': (base as { description?: string }).description,
              'gen_ai.conversation.id': state.init?.sessionId,
            });
            if (captureContent()) {
              span.setAttribute('gen_ai.tool.call.arguments', safeAttr(params));
            }
            try {
              const res = await originalExecute(toolCallId, params, signal, onUpdate, ctx);
              if (res && (res as { isError?: boolean }).isError) {
                span.setAttribute('error.type', 'tool_error');
                span.setStatus({ code: SpanStatusCode.ERROR, message: 'tool returned isError' });
              }
              if (captureContent() && res && (res as { content?: unknown }).content) {
                span.setAttribute(
                  'gen_ai.tool.call.result',
                  safeAttr((res as { content?: unknown }).content),
                );
              }
              return res;
            } catch (err) {
              span.setAttribute('error.type', err instanceof Error ? err.name : 'Error');
              throw err;
            }
          },
          // Parent explicitly to the turn context so nesting holds even if the
          // SDK's tool callback runs outside the turn's async context.
          { parentContext: state.turnContext },
        ),
      ),
  };
}
