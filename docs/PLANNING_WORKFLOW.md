# Planning Workflow

Intelligent multi-phase execution for complex tasks. When facing work that requires multiple steps, the agent can create a structured plan with safety-classified phases, real-time progress tracking, and human-in-the-loop controls.

---

## What It Is

A system that breaks down complex tasks into manageable phases:
- **Safe phases** (read-only) execute automatically
- **Non-safe phases** (writes/executes) request approval based on risk vs. autonomy level
- **Plans adapt** mid-execution based on discoveries
- **Progress persists** across app restarts
- **Backend validation** catches AI safety misclassifications

**When it activates:** AI decides when to use planning for complex tasks. Multi-step operations like refactorings, feature implementations, or system migrations typically trigger plan creation.

---

## How It Works

### Plan Creation

Agent analyzes your request and creates phases:
```
User: "Refactor auth to use JWT tokens"

Plan created:
  Phase 1: Analyze current auth code (safe)
  Phase 2: Design JWT architecture (safe)
  Phase 3: Install dependencies (non-safe)
  Phase 4: Implement changes (non-safe)
  Phase 5: Write tests (non-safe)
  Phase 6: Update docs (non-safe)
```

Each phase has:
- **Name and description**
- **Actions** to perform
- **Risk level** (0-100)
- **Safety classification** (safe = read-only, non-safe = writes/executes)

### Phase Execution

Phases execute sequentially. When a phase's risk exceeds your autonomy level, you'll be asked to approve it.

**Approval Logic:**
- If `phase.risk <= autonomyLevel`: executes automatically
- If `phase.risk > autonomyLevel`: shows approval dialog

**Example:** Autonomy at 50 means phases with risk ≤ 50 execute automatically; phases with risk > 50 request approval.

### Safety Classification

Backend validates all safety classifications to catch AI mistakes:

**Safe operations:**
- Read, Grep, Find, Ls (file inspection)
- Analysis and design work
- Documentation reading

**Non-safe operations:**
- Write, Edit (file modifications)
- Bash (command execution)
- Package installations
- Configuration changes

**Safety Validation:**
- AI classifies each phase (safe/non-safe, risk 0-100)
- Backend independently analyzes phase actions
- If mismatch detected → warning logged, backend classification used
- Prevents AI from marking dangerous phases as "safe"

### Risk Levels

Visual color coding:
- **0-30 (Green):** Low risk, simple changes
- **31-60 (Yellow):** Medium risk, significant impact
- **61-100 (Red):** High risk, critical changes

### Dynamic Revision

Plans can change mid-execution:
- Agent discovers new information
- Errors or blockers encountered
- User provides feedback
- Simpler approach identified

Version tracking shows v1 → v2 → v3 with change explanations.

---

## UI Components

### Plan Progress Widget

Collapsible widget showing plan status:
```
┌─────────────────────────────────────┐
│ ▼ Implementation Plan  v2    3/5    │
├─────────────────────────────────────┤
│ ✓ Phase 1: Analysis (0:45)          │
│   Risk: 15/100 · Safe               │
│   › Findings: 3 auth components     │
│                                      │
│ ⏵ Phase 2: Design (0:12)            │
│   Risk: 20/100 · Safe               │
│   Status: In progress...            │
│                                      │
│ ○ Phase 3: Implementation           │
│   Risk: 65/100 · Non-safe           │
│   Status: Waiting for approval      │
│                                      │
│ [Pause] [Cancel]                    │
└─────────────────────────────────────┘
```

**Features:**
- Click to collapse/expand
- Phase status indicators (✓ complete, ⏵ running, ○ pending, ⊘ skipped, ! error)
- Duration tracking
- Expandable findings
- Risk visualization with color coding
- Pause/Cancel controls

### Phase Approval Dialog

Modal for approving non-safe phases:
- Shows phase name, description, actions
- Risk assessment with color coding
- Optional user notes/instructions
- **Actions:** Approve / Deny

**Keyboard shortcuts:**
- `Enter` — Approve
- `Esc` — Deny

### Plan Revision Notification

Inline alert when plan changes:
- Shows version change (v1 → v2)
- Reason for revision
- Summary of changes
- Auto-dismisses after 10 seconds

### Error Recovery Notification

Error alerts with recovery options:
- Shows error message
- Phase that failed
- **Recovery options:** Retry Phase / Skip Phase / Cancel Plan

**Retry:** Resets failed phase to pending, attempts execution again
**Skip:** Marks phase as skipped, continues with next phase
**Cancel:** Stops execution, preserves completed work

---

## Autonomy Level

The autonomy slider (0-100) controls approval frequency:

- **0-30 (Cautious):** Frequent approvals, maximum control
- **31-55 (Balanced):** Approval for medium+ risk operations
- **56-80 (Confident):** Mostly autonomous, high-risk checks
- **81-100 (Autonomous):** Minimal interruptions, critical-only approvals

**Example:** Autonomy at 50 means phases with risk ≤ 50 execute automatically; phases with risk > 50 request approval.

---

## Plan Controls

**Pause:**
- Stops execution at current phase
- State preserved
- Shows "⏸ Plan paused" status
- Note: Currently no Resume button (must cancel and restart)

**Cancel:**
- Stops execution immediately
- Completed work preserved
- Remaining phases not executed
- Plan can be viewed but not continued

**Persistence:** Plans survive app restarts. Quit and reopen later to view progress.

---

## Best Practices

### When to Use Planning

✅ **Good for:**
- Multi-file refactorings
- Feature implementations touching multiple components
- System migrations (auth, database, API)
- Complex bug fixes requiring analysis + changes
- Exploration before implementation

❌ **Not ideal for:**
- Single-file edits
- Simple one-step operations
- Exploratory questions without execution
- Urgent fixes (planning adds overhead)

### Writing Effective Requests

**Be specific:**
```
❌ "Improve the codebase"
✓ "Refactor user authentication to use bcrypt instead of plain-text passwords"
```

**Mention constraints:**
```
✓ "Add dark mode support - don't change the color palette, only add theme switching"
```

**Indicate risk tolerance:**
```
✓ "Optimize database queries (review plan before making schema changes)"
```

### During Execution

- **Review phase descriptions** before approving non-safe phases
- **Check risk assessments** — high-risk phases deserve extra scrutiny
- **Read findings** from completed phases for context
- **Ask AI to revise** if you discover a better approach

---

## Revising Plans Mid-Execution

**To modify a plan:**
1. Send a message asking AI to revise: "Can we simplify this by using X instead?"
2. AI will use the `RevisePlan` tool to update remaining phases
3. Completed phases remain unchanged
4. Plan version increments (v1 → v2)
5. Revision notification appears explaining changes

**Example:**
```
You: "Wait, we already have auth middleware. Can we just extend it?"
AI: [Uses RevisePlan tool]
Notification: "Plan revised (v1 → v2): Extend existing auth instead of creating new JWT system"
```

---

## FAQ

**Q: How does the agent decide when to create a plan?**  
A: The AI decides based on task complexity. System prompt guides: "5+ steps, multi-file changes, exploration before implementation, approach may change based on discoveries."

**Q: What if I don't want planning?**  
A: Just proceed normally. Single-step operations work as before without planning overhead.

**Q: Can I modify a plan mid-execution?**  
A: Yes, via chat. Ask AI to revise the plan (e.g., "Can we use library X instead?") and it will use the RevisePlan tool to update remaining phases.

**Q: What if a phase fails?**  
A: You'll see error notification with Retry / Skip / Cancel options. Retry attempts the phase again, Skip marks it as skipped and continues, Cancel stops the plan.

**Q: Can I pause and resume later?**  
A: You can pause execution, but there's currently no Resume button. You'd need to cancel and potentially restart. Plans persist across app restarts for reference.

**Q: How accurate is the safety classification?**  
A: Risk scores and safety classifications are provided by the AI when creating the plan. The backend validates that scores are within 0-100 and that phases marked as "safe" have low risk (<20). Since the AI has full context of the task and intent, classifications are more accurate than keyword-based approaches.

**Q: What happens if I deny a phase?**  
A: Phase is marked as "skipped" and execution continues with the next phase. Denied phases won't be executed.

---

## Architecture Notes

For contributors:

**Backend:**
- PlanManager orchestrates lifecycle
- Risk scoring done by AI (validated for sanity by backend)
- RevisionDetector analyzes findings for plan revision triggers
- PlanStorage persists plans to session directories
- Event-driven architecture (all updates via events)

**Frontend:**
- useChat hook manages planning state
- 4 UI components (PlanProgress, PhaseApprovalDialog, PlanRevisionNotification, PlanErrorNotification)
- Full ARIA support for accessibility
- Keyboard navigation throughout

**Integration:**
- 3 custom tools in Pi SDK: CreatePlan, ReportPhaseProgress, RevisePlan
- ~1,800 token system prompt injection teaches planning workflow
- IPC bridge for plan state queries (cache-based for performance)
- Plans tied to session lifecycle

**Safety Layer:**
- AI provides initial safety classification
- Backend independently analyzes phase actions
- Mismatch detection warns and overrides AI
- Prevents dangerous auto-execution
