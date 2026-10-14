// Pi times execute() only, but the permission gate (plan mode) and the
// collaboration/planning tools wait on the user *inside* execute(). Reporting
// that as tool time would measure how long the user thought, so the gate's wait
// is subtracted and human-blocking tools get no duration. MCP approvals run in
// the tool_call hook before execute(), so pi already excludes them.

const HUMAN_BLOCKING_TOOLS = new Set([
  'requestdecision',
  'requestpreference',
  'requestfeedback',
  'requestguidance',
  'requestapproval',
  'createplan',
  'reportphaseprogress',
  'reviseplan',
]);

const approvalWaitByCallId = new Map<string, number>();

export function recordApprovalWait(toolCallId: string, waitedMs: number): void {
  if (waitedMs <= 0) return;
  approvalWaitByCallId.set(toolCallId, getApprovalWait(toolCallId) + waitedMs);
}

export function getApprovalWait(toolCallId: string): number {
  return approvalWaitByCallId.get(toolCallId) ?? 0;
}

export function clearApprovalWait(toolCallId: string): void {
  approvalWaitByCallId.delete(toolCallId);
}

export function resolveToolDurationMs(args: {
  toolName: string;
  reportedMs: number | undefined;
  approvalWaitMs?: number;
}): number | undefined {
  const { toolName, reportedMs, approvalWaitMs = 0 } = args;
  if (reportedMs === undefined || !Number.isFinite(reportedMs)) return undefined;
  if (HUMAN_BLOCKING_TOOLS.has(toolName.toLowerCase())) return undefined;
  return Math.max(0, Math.round(reportedMs - approvalWaitMs));
}
