import { describe, expect, it } from 'vitest';
import {
  clearApprovalWait,
  getApprovalWait,
  recordApprovalWait,
  resolveToolDurationMs,
} from './tool-duration';

describe('resolveToolDurationMs', () => {
  it('passes pi’s execute() time through for ordinary tools', () => {
    expect(resolveToolDurationMs({ toolName: 'bash', reportedMs: 1234 })).toBe(1234);
    expect(resolveToolDurationMs({ toolName: 'mcp__github__search', reportedMs: 80 })).toBe(80);
  });

  it('subtracts time spent waiting on the permission gate', () => {
    expect(
      resolveToolDurationMs({ toolName: 'bash', reportedMs: 65_000, approvalWaitMs: 60_000 }),
    ).toBe(5000);
  });

  it('never goes negative when the recorded wait slightly exceeds the reported time', () => {
    expect(resolveToolDurationMs({ toolName: 'bash', reportedMs: 100, approvalWaitMs: 150 })).toBe(
      0,
    );
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

describe('approval wait accounting', () => {
  it('accumulates per call id until cleared', () => {
    recordApprovalWait('call-a', 400);
    recordApprovalWait('call-a', 600);
    recordApprovalWait('call-b', 50);
    expect(getApprovalWait('call-a')).toBe(1000);
    expect(getApprovalWait('call-a')).toBe(1000);

    clearApprovalWait('call-a');
    expect(getApprovalWait('call-a')).toBe(0);
    expect(getApprovalWait('call-b')).toBe(50);
  });

  it('ignores non-positive waits and unknown ids', () => {
    recordApprovalWait('call-c', 0);
    recordApprovalWait('call-c', -5);
    expect(getApprovalWait('call-c')).toBe(0);
    expect(getApprovalWait('never-recorded')).toBe(0);
  });
});
