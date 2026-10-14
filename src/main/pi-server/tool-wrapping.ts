// Instruments our own tools as GenAI `execute_tool` spans and bridges
// browser_tool to main. Permission gating lives in tool-governance.ts.
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { withOperation } from './operation-tracker';
import { captureContent, safeAttr, setAttrs, SpanStatusCode, withSpan } from '../../shared/otel';
import { state } from './state';
import { send } from './transport';
import type { MsgBrowserToolRequest, MsgBrowserToolResult } from '../agent-runtime/pi/protocol';

export function requestBrowserTool(
  sessionId: string,
  command: string,
): Promise<MsgBrowserToolResult> {
  return new Promise((resolve) => {
    const requestId = `browser_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    state.pendingBrowserTool.set(requestId, { resolve });
    const req: MsgBrowserToolRequest = {
      type: 'browser_tool_request',
      requestId,
      sessionId,
      command,
    };
    send(req);

    state.turnAbort?.signal.addEventListener('abort', () => {
      const pending = state.pendingBrowserTool.get(requestId);
      if (pending) {
        state.pendingBrowserTool.delete(requestId);
        pending.resolve({
          type: 'browser_tool_result',
          requestId,
          output: 'Turn aborted',
          isError: true,
        });
      }
    });
  });
}

/**
 * Wrap a tool definition so each execution is a GenAI `execute_tool` span
 * (span name `execute_tool <name>`) nested under the active turn span. Applied
 * to every tool (builtin, web, agent, collaboration, planning) so the trace is
 * uniform. When tracing is disabled `withSpan` uses the API's no-op tracer, so
 * this is effectively free.
 */
export function instrumentTool(base: ToolDefinition<any, any>): ToolDefinition<any, any> {
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
