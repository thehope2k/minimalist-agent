import { describe, expect, it } from 'vitest';
import { resolveToolDurationMs } from './tool-duration';

describe('resolveToolDurationMs', () => {
  it('passes pi’s execute() time through for ordinary tools', () => {
    expect(resolveToolDurationMs({ toolName: 'bash', reportedMs: 1234 })).toBe(1234);
    expect(resolveToolDurationMs({ toolName: 'mcp__github__search', reportedMs: 80 })).toBe(80);
  });

  it('is undefined when pi reports no duration (tool never ran)', () => {
    expect(resolveToolDurationMs({ toolName: 'bash', reportedMs: undefined })).toBeUndefined();
    expect(resolveToolDurationMs({ toolName: 'bash', reportedMs: Number.NaN })).toBeUndefined();
  });

  it.each([
    'RequestDecision',
    'RequestPreference',
    'RequestFeedback',
    'RequestGuidance',
    'RequestApproval',
    'CreatePlan',
    'ReportPhaseProgress',
    'RevisePlan',
    'requestdecision',
  ])('omits the duration for human-blocking tool %s', (toolName) => {
    expect(resolveToolDurationMs({ toolName, reportedMs: 90_000 })).toBeUndefined();
  });

  it('keeps durations for long-running delegation and browser tools', () => {
    expect(resolveToolDurationMs({ toolName: 'Agent', reportedMs: 180_000 })).toBe(180_000);
    expect(resolveToolDurationMs({ toolName: 'browser_tool', reportedMs: 2500 })).toBe(2500);
  });
});
