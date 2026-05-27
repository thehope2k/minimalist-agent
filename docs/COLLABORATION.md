# Collaboration System — Feature Overview

Structured human-in-the-loop collaboration between user and agent. Instead of asking questions
in prose ("Which approach should I use?"), agent uses typed tools that render as interactive
dialogs with clear options.

---

## What It Is

A system for controlling **how often** the agent engages you during work:
- **Plan Mode** — Read-only exploration, zero execution risk
- **Auto Mode** — Full execution with adjustable autonomy (0-100% slider)

Higher autonomy = fewer questions, more independence.  
Lower autonomy = frequent collaboration, more control.

**Current implementation:** Auto mode always executes. Agent uses collaboration tools based on autonomy level.

**Original vision (not yet implemented):** In Auto mode, agent intelligently decides:
- Whether to show planning phases before executing
- Whether to propose a plan first vs. execute directly
- When execution needs upfront planning vs. immediate action

See "Missing: Intelligent Plan/Execute Decision" below for details.

## The Five Collaboration Types

**1. RequestDecision** — Choose between technical alternatives
```
Agent: "Which authentication approach?"
Options:
  • JWT Tokens (stateless, scalable)
    Pros: No server state, works with microservices
    Cons: Token size, no instant revocation
  • Session Cookies (simpler, server state)
    Pros: Smaller, instant logout
    Cons: Requires sticky sessions
  • [Custom approach...]

User clicks or types custom answer.
```

**2. RequestApproval** — Allow/deny risky operations
```
Agent: "Can I edit package.json?"
Risk: 75/100 (config file, dependency change)
Reasoning: Adding bcrypt for password hashing

User: [Approve] or [Deny]
```

**3. RequestPreference** — Subjective/style choices
```
Agent: "Directory structure preference?"
Options:
  • src/auth/ (flat, simple)
  • src/middleware/auth/ (organized)

User picks one.
```

**4. RequestFeedback** — Validate completed work
```
Agent: "Created authentication middleware"
Details: JWT validation, refresh tokens, rate limiting

User: "Looks good" or "Change the timeout to 24h"
```

**5. RequestGuidance** — Clarify vague requests
```
Agent: "By 'authentication' do you mean:"
  • Login/logout only?
  • Full role-based access control (RBAC)?
  • OAuth third-party?

User explains intent.
```

## How Autonomy Works

**The autonomy slider (0-100%) controls engagement frequency:**

```
0-30% (Collaborative)
  → Asks for most decisions, preferences, approvals
  → Frequent checkpoints and feedback requests
  → High user involvement

40-60% (Balanced)
  → Asks for complex decisions and risky operations
  → Follows conventions without asking
  → Moderate involvement

70-90% (Independent)
  → Makes most decisions independently
  → Asks only for very risky operations
  → Minimal involvement

90-100% (Maximum)
  → Near-complete autonomy
  → Asks only for catastrophic operations
  → User observes results
```

**Example: "Add authentication"**

At 20% autonomy:
- Agent asks which approach (JWT vs Sessions)
- Asks directory structure preference
- Requests approval for package.json edit
- Asks for feedback after implementation

At 80% autonomy:
- Agent chooses JWT (best practice)
- Follows src/auth/ convention automatically
- Edits package.json without asking (risk 60 < 80)
- Completes independently

## Benefits Over Prose Questions

**Traditional agent:**
```
Agent: "I can use JWT or session cookies. Which one?"
User: "JWT"
Agent: "Thanks. Should I put it in src/auth/ or src/middleware/auth/?"
User: "First one"
Agent: "Got it. Can I edit package.json?"
User: "yes"
```

**With collaboration tools:**
```
Agent shows decision dialog:
┌─────────────────────────────────────────┐
│ Which authentication approach?          │
│ ○ JWT Tokens                            │
│   Pros: Stateless, scalable...         │
│ ○ Session Cookies                       │
│   Pros: Simpler...                      │
│                                         │
│ [JWT Tokens]  [Session Cookies]  [×]    │
└─────────────────────────────────────────┘
```

**Advantages:**
- Clear options with pros/cons
- Clickable vs. typing
- Machine-readable responses (no ambiguity)
- Consistent UI across all collaboration types
- Auditable decision trail

---

## Known Limitations

### 1. Missing: Intelligent Plan/Execute Decision

**Issue:** Auto mode doesn't intelligently decide when to plan first vs. execute directly.

**Current behavior:**
```
User: "Add authentication"
Agent: [Immediately starts executing]
  Reading files...
  Creating middleware...
  Editing package.json...
```

**Intended behavior (from original design):**
```
User: "Add authentication" (complex task)
Agent: [Recognizes complexity, shows planning first]
  📋 Phase 1: Exploring codebase
    ✓ Found patterns...
  📋 Phase 2: Analyzing requirements
    ✓ Recommending JWT...
  📋 Phase 3: Designing solution
    ✓ Proposed plan ready
  
  [Shows complete plan, then asks approval to execute]

Vs.

User: "Fix that typo" (simple task)
Agent: [Immediately executes, no planning phase]
  ✓ Fixed typo in README.md
```

**Why it matters:**
- Complex tasks benefit from visible planning
- Simple tasks don't need ceremony
- Agent should adapt to task complexity

**Implementation approach (original design):**
- Add `ReportPhase` tool for visible planning progress
- Agent assesses task complexity in Auto mode
- High complexity → show planning phases → present plan → execute
- Low complexity → execute directly
- Autonomy slider influences when to show planning

**Status:** Deferred. Marked as Medium Priority in ROADMAP.md.

**Workaround:** Manually switch to Plan mode for complex tasks, then switch back to Auto.

---

### 2. No Backend Safety Limits

**Issue:** System trusts agent's risk assessment completely. No backend enforcement.

**Risk:** Dangerous operations (rm -rf, .env deletion, sudo commands) could slip through
if agent misjudges risk.

**Current:** System prompt guidance only ("treat .env as high risk").

**Future:** Add backend hard limits for known dangerous patterns:
```
.env files        → always require approval
rm -rf commands   → always require approval
sudo commands     → always require approval
package.json      → require approval if autonomy < 60%
```

Low effort (~2-3 hours), high safety value.

### 2. No Formal Risk Scoring

**Issue:** Agent decides "is this risky?" intuitively, not via calculation.

**Current:** Agent thinks "package.json is config, probably ask" but doesn't
formally compute risk = 60 based on rubrics.

**Impact:** Inconsistent decisions. Same file might prompt at 50% autonomy once,
not prompt another time.

**Future:** Add assessment tool where agent calculates:
- Risk (0-100): file type + operation + reversibility
- Complexity (0-100): multiple approaches? trade-offs?
- Subjectivity (0-100): style preference vs. technical best practice?

Then backend validates scores and enforces minimums. See original design doc for
full rubrics. Deferred until usage shows need.

### 3. No Decision Memory

**Issue:** Agent doesn't remember "user approved package.json edit 5 minutes ago."

**Impact:** Asks same approval multiple times in one session.

**Future:** Session-scoped memory or "apply to all similar" checkbox.

### 4. Token Cost

**Issue:** Dynamic autonomy guidance costs ~1,500 tokens per message.

**With caching:** First turn ~$0.06, subsequent ~$0.006 (cheap).

**Alternative:** Simplify to 3 static modes (Collaborative/Balanced/Independent)
would use ~150 tokens (90% savings). Consider if usage data shows users cluster
around 20%, 50%, 80% and don't use intermediate values.

### 5. Limited Explanations

**Issue:** Agent doesn't always explain WHY it's asking.

**Future:** Show risk calculation, "why are you asking?" expandable section.

---

## Implementation Notes

**Architecture:**
```
Main process:
  collaboration-types.ts         — TypeScript types
  collaboration-handlers.ts      — IPC handlers, state
  collaboration-prompt.ts        — System prompt injection
  pi-server/index.ts             — Tool definitions

Renderer:
  CollaborationPrompt.tsx        — UI dialogs
  PermissionModeButton.tsx       — Mode + slider control
```

**System prompt:** Injected with autonomy level, guides agent when to call tools
based on operation risk/complexity vs. autonomy threshold (~1,500-1,700 tokens).

**Tool calling:** Agent uses normal tool call mechanism, but tools pause execution
and wait for user response via IPC.

---

## See Also

- Original design (comprehensive): `docs/intelligent-automation-system.md`
- Implementation: `src/main/agent/collaboration-*.ts`
