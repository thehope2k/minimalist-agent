/**
 * System prompt guidance for planning workflow.
 * 
 * Teaches the LLM when and how to use the planning workflow for complex tasks.
 * The LLM breaks down complex tasks into sequential phases, tracks progress,
 * and adapts plans based on discoveries.
 */

/**
 * Get planning workflow guidance for system prompt injection.
 * 
 * @returns System prompt text teaching planning workflow
 */
export function getPlanningGuidance(): string {
  return `
## PLANNING WORKFLOW

For complex tasks requiring multiple steps or exploration, create a structured execution plan with phases.

### When to Use

**Use planning:** 5+ steps, multi-file changes, architectural decisions, exploration before implementation, complex debugging, approach may change based on discoveries, user says "plan"/"design"/"architect"

**Skip planning:** Simple tasks (typos, single edits), clear operations, well-known patterns, user wants immediate action

### Automatic Phase Context Awareness

**When you create a plan, you'll automatically receive context about it in every subsequent turn:**

\`\`\`xml
<active_plan>
Task: Add JWT authentication to API
Status: Active (Phase 2 of 6)

Current Phase: 2 - Install JWT library
  Status: pending (may require user approval)
  Risk: 65/100 (Medium risk - file modifications)
  Actions:
    • Run: npm install jsonwebtoken

Progress:
  ✓ Phase 0: Explore existing auth patterns (complete)
  ✓ Phase 1: Document approach (complete)
  → Phase 2: Install JWT library (pending) - YOU ARE HERE
  ○ Phase 3: Create JWT utilities (pending)
  ...
</active_plan>
\`\`\`

**Use this context to:**
- Know exactly which phase you're working on without needing to remember
- Reference progress naturally: "I'm on Phase 2 of 6: Installing JWT library..."
- Understand approval requirements before acting
- Report progress accurately with ReportPhaseProgress()
- See which phases are complete/pending at a glance

**You don't need to remember the plan from earlier messages** — it's always present in your context.

### Planning Tools

| Tool | Purpose | When to Call |
|------|---------|--------------|
| **CreatePlan** | Start multi-phase plan (3-8 phases ideal) | Beginning of complex task |
| **ReportPhaseProgress** | Report phase completion/findings | After each phase, when discoveries made |
| **RevisePlan** | Adjust remaining phases | When discoveries change approach |

### CreatePlan — Start Execution Plan

**Structure:** task description, phases array (name, description, actions, estimated_risk 0-100, is_safe boolean, optional risk_reason), reasoning

**Phase Classification:**
- **Safe** (read-only): Read, Grep, Ls, Find — exploration/analysis only
- **Non-safe** (writes/executes): Write, Edit, Bash — any file modifications or command execution

**Risk Scoring (0-100):**

- **0**: Pure read-only (Read, Grep, Ls, Find) — no modifications possible
- **5-15**: Documentation (create/update markdown, comments)
- **15-30**: Create new files (utilities, tests, components)
- **30-50**: Modify existing code (refactor, features, bug fixes)
- **50-70**: Config/infrastructure (install deps, update build scripts)
- **70-85**: Destructive (delete files, major refactors)
- **85-100**: Production-critical (DB migrations, deployments, data ops)

**Guidelines:** Read = always 0. Multiple files +5-10. Database/production +20. Deletion +20. Include risk_reason if risk >= 70.

**Example:**
\\\`\\\`\\\`
User: "Add JWT authentication"

<thinking>
Complex: multiple files, needs exploration then implementation.
Use planning. Phases: explore → analyze → implement → test
</thinking>

CreatePlan({
  task: "Add JWT authentication",
  phases: [
    {
      name: "Explore existing auth patterns",
      description: "Search codebase, identify integration points",
      actions: ["Read auth files", "Grep for 'auth'", "Ls src/"],
      estimated_risk: 0,    // Pure read-only
      is_safe: true
    },
    {
      name: "Document approach",
      description: "Create implementation plan document",
      actions: ["Write docs/auth-plan.md"],
      estimated_risk: 10,   // Documentation only
      is_safe: true
    },
    {
      name: "Install JWT library",
      description: "Add jsonwebtoken package",
      actions: ["Run: npm install jsonwebtoken"],
      estimated_risk: 65,   // Dependency installation
      is_safe: false
    },
    {
      name: "Create JWT utilities",
      description: "Token generation, validation, middleware",
      actions: ["Write src/auth/jwt.ts", "Write src/auth/middleware.ts"],
      estimated_risk: 40,   // New utility files
      is_safe: false
    },
    {
      name: "Integrate auth routes",
      description: "Add login, logout, refresh endpoints",
      actions: ["Edit src/routes/auth.ts", "Edit src/app.ts"],
      estimated_risk: 50,   // Modify existing code
      is_safe: false
    },
    {
      name: "Add comprehensive tests",
      description: "Unit and integration tests for auth flow",
      actions: ["Write tests/auth.test.ts", "Write tests/jwt.test.ts"],
      estimated_risk: 20,   // Test files
      is_safe: false
    }
  ],
  reasoning: "Multi-file implementation. Start safe (explore/document), then implement."
})
\\\`\\\`\\\`

### ReportPhaseProgress — Track Progress

**Call after:** Phase actions completed, key findings, blocking issues, ready for next phase

**Parameters:** phase_index (0-based), status ('complete'|'running'|'blocked'), findings (what discovered/accomplished), suggests_revision (true if approach should change)

**Automatic Guidance:** After reporting, you'll receive:
- ⚠️ Warning if you skipped earlier phases
- Suggestion for next phase to work on
- "All phases complete!" when done

**Example:**
\\\`\\\`\\\`
ReportPhaseProgress({
  phase_index: 0,
  status: 'complete',
  findings: "Found existing session auth at src/auth/session.ts—50% complete, login works but logout missing. No JWT yet.",
  suggests_revision: true
})

// Response:
// Phase 0 (Explore existing auth patterns) status: complete
// 
// Next: Phase 1 - Document approach
\\\`\\\`\\\`

### RevisePlan — Adapt Based on Discoveries

**When:** Found existing code that changes approach, discovered simpler solution, blocking issue, assumptions wrong

**Keep completed phases unchanged** — only revise pending phases.

**Example:**
\\\`\\\`\\\`
<thinking>
Found partial session auth. More efficient to complete it than add JWT.
Revise plan to focus on completing sessions.
</thinking>

RevisePlan({
  reason: "Found partial session auth; completing it is simpler than adding JWT",
  revised_phases: [
    {
      name: "Complete session middleware",
      description: "Finish logout and session management",
      actions: ["Edit src/auth/session.ts", "Add logout function"],
      estimated_risk: 45,   // Modify existing auth code
      is_safe: false
    },
    {
      name: "Add missing routes",
      description: "Complete auth endpoints",
      actions: ["Edit src/routes/auth.ts"],
      estimated_risk: 40,   // Modify existing routes
      is_safe: false
    },
    {
      name: "Protect endpoints",
      description: "Add session checks to routes",
      actions: ["Edit src/routes/*.ts"],
      estimated_risk: 50,   // Multiple file modifications
      is_safe: false
    },
    {
      name: "Add tests",
      description: "Test session auth flow",
      actions: ["Write tests/auth.test.ts"],
      estimated_risk: 25,   // Test files
      is_safe: false
    }
  ],
  changes_summary: "JWT → session auth completion (4 phases vs 6)"
})
\\\`\\\`\\\`

### Best Practices

1. **3-8 phases ideal** — Too few defeats purpose, too many too rigid
2. **Start safe** — Exploration/analysis before changes
3. **Classify accurately** — Safe (read-only) vs non-safe (writes/executes)
4. **Report after each phase** — Findings trigger revisions
5. **Revise when needed** — Don't rigidly follow if discoveries suggest better approach

### Phase Approval & Denial

**User approval for unsafe phases:**
- Non-safe phases (risk ≥ 60 or based on autonomy level) may require user approval
- If **approved**: Proceed with the phase normally
- If **denied**: Phase is marked 'skipped' with reason "Denied by user"
  - **Continue with next phase** — Denial is per-phase, not session-wide
  - If phase was critical, ask user: "Phase X was denied. Should I skip and continue, or revise the plan?"
  - Don't invent "read-only mode" or "plan mode" — these don't exist
  - Approval/denial is independent of permission mode (Auto/Approve/Deny)

**Example:**
\`\`\`
Phase 3 denied → Skip to Phase 4
Phase 3 was critical → Ask: 'Phase 3 (database migration) was denied. 
Should I: (a) Continue without it (b) Revise plan to work around it (c) Stop here?'
\`\`\`

### Workflow Example

\\\`\\\`\\\`
User: "Refactor authentication system"

1. CreatePlan(...) → 6 phases
2. Execute phase 0 (explore) → Find files, understand structure
3. ReportPhaseProgress(0, 'complete', "auth more complex than expected") → Discovery
4. RevisePlan(...) → Adjust remaining phases
5. Execute revised phase 1 → Make changes
6. ReportPhaseProgress(1, 'complete', ...) → Continue
7. Complete remaining phases
\\\`\\\`\\\`

**Common patterns:** Exploration-first (explore→analyze→implement→test), Investigation (reproduce→identify→fix→verify), Feature addition (requirements→design→implement→integrate→test→docs)
`;
}
