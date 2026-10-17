import { describe, expect, it } from 'vitest';
import type { ChatMessage, MessagePart } from '@/lib/chat';
import { applyEvent, applyNestedEvent } from './apply-event';

type ToolPart = Extract<MessagePart, { kind: 'tool' }>;

const runningTool = (): ToolPart => ({
  kind: 'tool',
  toolUseId: 't1',
  name: 'bash',
  status: 'running',
});

describe('applyEvent › tool_result', () => {
  const msg = (): ChatMessage => ({
    id: 'm1',
    role: 'assistant',
    parts: [runningTool()],
    isStreaming: true,
  });

  it('records the tool duration on the part', () => {
    const next = applyEvent(msg(), {
      id: 'e',
      type: 'tool_result',
      toolUseId: 't1',
      content: 'ok',
      durationMs: 2500,
    });
    expect(next.parts[0]).toMatchObject({ status: 'done', durationMs: 2500 });
  });

  it('leaves duration unset when the backend sent none (older runtimes / human-blocking tools)', () => {
    const next = applyEvent(msg(), {
      id: 'e',
      type: 'tool_result',
      toolUseId: 't1',
      content: 'ok',
    });
    expect((next.parts[0] as ToolPart).durationMs).toBeUndefined();
  });
});

describe('applyNestedEvent › tool_result (sub-agent transcript)', () => {
  it('records the tool duration on nested parts too', () => {
    const { parts } = applyNestedEvent(
      [runningTool()],
      { type: 'tool_result', toolUseId: 't1', content: 'ok', isError: true, durationMs: 4100 },
      undefined,
      0,
      undefined,
    );
    expect(parts[0]).toMatchObject({ status: 'error', durationMs: 4100 });
  });
});

describe('applyEvent › retry_progress', () => {
  const streaming = (): ChatMessage => ({
    id: 'm1',
    role: 'assistant',
    parts: [],
    isStreaming: true,
  });
  const waiting = {
    id: 'e',
    type: 'retry_progress',
    phase: 'waiting',
    attempt: 2,
    maxAttempts: 3,
    delayMs: 4000,
    reason: 'Service error',
  } as const;

  it('records the pending retry with an absolute deadline', () => {
    const before = Date.now();
    const next = applyEvent(streaming(), waiting);
    expect(next.retry).toMatchObject({ attempt: 2, maxAttempts: 3, reason: 'Service error' });
    expect(next.retry!.retryAt).toBeGreaterThanOrEqual(before + 4000);
    expect(next.isStreaming).toBe(true);
  });

  it('clears the notice when the retry resolves', () => {
    const retrying = applyEvent(streaming(), waiting);
    expect(applyEvent(retrying, { id: 'e', type: 'retry_progress', phase: 'done' }).retry).toBe(
      undefined,
    );
  });

  it('clears the notice when the turn ends', () => {
    const retrying = applyEvent(streaming(), waiting);
    expect(applyEvent(retrying, { id: 'e', type: 'turn_done' }).retry).toBeUndefined();
  });
});
