// Pi times execute() only. Permission approvals run in the tool_call hook
// (tool-governance.ts), before execute(), so they're already excluded. The
// collaboration/planning tools wait on the user *inside* execute(); reporting
// that as tool time would measure how long the user thought, so they get none.

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

export function resolveToolDurationMs(args: {
  toolName: string;
  reportedMs: number | undefined;
}): number | undefined {
  const { toolName, reportedMs } = args;
  if (reportedMs === undefined || !Number.isFinite(reportedMs)) return undefined;
  if (HUMAN_BLOCKING_TOOLS.has(toolName.toLowerCase())) return undefined;
  return Math.max(0, Math.round(reportedMs));
}
