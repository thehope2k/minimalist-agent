import { describe, expect, it, vi } from 'vitest';
import type { AgentSessionEvent } from '@earendil-works/pi-coding-agent';
import { adaptAgentEvent } from './event-adapter';
import { recordApprovalWait } from './tool-duration';

vi.mock('./event-adapter/debug', () => ({ debug: vi.fn() }));

function toolEnd(over: Record<string, unknown>): AgentSessionEvent {
  return {
    type: 'tool_execution_end',
    toolCallId: 'call-1',
    toolName: 'bash',
    result: { content: [{ type: 'text', text: 'ok' }] },
    isError: false,
    ...over,
  } as unknown as AgentSessionEvent;
}

describe('adaptAgentEvent › tool_execution_end durationMs', () => {
  it('forwards pi’s execute() duration on tool_result', () => {
    const [evt] = adaptAgentEvent(toolEnd({ toolCallId: 'c-fast', durationMs: 2340 }));
    expect(evt).toMatchObject({ type: 'tool_result', toolUseId: 'c-fast', durationMs: 2340 });
  });

  it('subtracts approval wait recorded by the permission gate', () => {
    recordApprovalWait('c-gated', 58_000);
    const [evt] = adaptAgentEvent(toolEnd({ toolCallId: 'c-gated', durationMs: 60_500 }));
    expect(evt).toMatchObject({ type: 'tool_result', durationMs: 2500 });
  });

  it('omits the key (not undefined) when pi reports no duration', () => {
    const [evt] = adaptAgentEvent(toolEnd({ toolCallId: 'c-none' }));
    expect(evt).toBeDefined();
    expect('durationMs' in evt!).toBe(false);
  });

  it('omits the duration for human-blocking tools', () => {
    const [evt] = adaptAgentEvent(
      toolEnd({ toolCallId: 'c-ask', toolName: 'RequestDecision', durationMs: 120_000 }),
    );
    expect('durationMs' in evt!).toBe(false);
  });
});
