/**
 * System prompt guidance for planning workflow.
 *
 * Teaches the LLM when to plan and the tracking/approval rules. Parameter
 * shapes live in the CreatePlan / ReportPhaseProgress / RevisePlan tool
 * schemas, and per-call guidance (next phase, revision hints, approval waits)
 * comes back in the tool results, so none of that is repeated here.
 */

/**
 * Get planning workflow guidance for system prompt injection.
 *
 * @returns System prompt text teaching planning workflow
 */
export function getPlanningGuidance(): string {
  return `
## PLANNING WORKFLOW

For complex tasks, create a structured execution plan (CreatePlan) and work it phase by phase.

**Use planning:** 5+ steps, multi-file changes, architectural decisions, exploration before implementation, complex debugging, approach may change based on discoveries, user says "plan"/"design"/"architect"

**Skip planning:** simple tasks (typos, single edits), clear operations, well-known patterns, user wants immediate action

### Building the plan

- 3-8 phases; start with read-only exploration before any change.
- \`is_safe\` means read-only (Read, Grep, Ls, Find). Anything that writes or executes (Write, Edit, Bash) is not safe.
- \`estimated_risk\` 0-100: **0** read-only · **5-15** docs · **15-30** new files · **30-50** modify code · **50-70** config/infrastructure · **70-85** destructive · **85-100** production-critical. Multiple files +5-10, database/production +20, deletion +20. Include \`risk_reason\` at risk >= 70.

### Tracking progress

- Call ReportPhaseProgress with \`status='running'\` **before** starting a phase and \`status='complete'\` **after** — the UI only shows which phase is active if you report both.
- An \`<active_plan>\` block carries the current phase on every later turn; you don't need to recall the plan from earlier messages.
- When findings change the approach, use RevisePlan. It replaces only the *pending* phases: completed ones are kept and phase indices stay absolute, so the first revised phase comes right after the last completed one (**not** index 0). The RevisePlan response states the exact index range — use it in the next ReportPhaseProgress call.

### Approval

- Phase approval applies only in **plan** mode. In **auto** mode phases never prompt.
- A non-safe phase prompts when its risk meets the autonomy threshold (risk >= autonomy; risk >= 85 always confirms).
- **Approved:** the session is promoted to auto for the rest of the session; proceed with the phase normally.
- **Denied:** the phase is marked 'skipped' ("Denied by user"). Continue with the next phase; if the skipped one was critical, ask whether to skip and continue, revise the plan, or stop.
`;
}
