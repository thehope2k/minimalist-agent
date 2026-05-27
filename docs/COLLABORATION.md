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

**1. Intelligent plan/execute decision**

Auto mode doesn't yet decide when to show planning phases vs. execute directly. The agent jumps straight to execution regardless of task complexity. Marked as Medium Priority in ROADMAP.md.

**Workaround:** Manually switch to Plan mode for complex tasks.

**2. No backend safety limits**

The system trusts the agent's risk assessment completely. Dangerous operations (rm -rf, .env deletion, sudo commands) could slip through if the agent misjudges risk. Currently relies on system prompt guidance only.

**3. No decision memory**

The agent doesn't remember recent approvals — may ask the same approval multiple times in one session.

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
