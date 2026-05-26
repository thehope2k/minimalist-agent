# Agent System Design

**Status:** Exploratory — open for discussion before implementation

---

## Overview

Currently, Minimalist Agent has one persona per session (the model you're talking to). The **Agent System** would enable defining specialized sub-agents that can be spawned within a session to handle focused tasks, similar to how Skills extend capabilities but for delegation.

### Examples

- **Researcher** — Read-only agent that analyzes code and documentation without risking accidental edits
- **Test Runner** — Agent with only bash and file tools, confined to `test/` directory
- **API Explorer** — Agent with web fetch and grep, no write permission, for investigating third-party APIs
- **Migration Guide** — Agent with a specialized system prompt teaching database schema patterns

Instead of the main agent trying to do all jobs, you delegate specific work to specialized agents. Each agent has:
- A **custom system prompt** tailored to its role
- **Restricted tools** (read-only, write-only, specific commands)
- Optional **model choice** (cheaper model for simple tasks)
- **Isolation** — sub-agent's tool calls don't bloat the main context window

---

## User Experience

### Creating an Agent

Similar to Skills (`@slug`), you'd create an `AGENT.md` file:

```markdown
---
name: Code Reviewer
description: Reads code and identifies issues. Never writes.
model: haiku  # optional, cheaper model for review
tools: [Read, Grep, Find, WebFetch]  # restricted set
maxTurns: 10
---

You are a code review expert. Your job is to:
- Identify potential bugs
- Flag performance issues
- Spot security concerns
- Suggest improvements

Never write or modify files. Always explain your reasoning.
```

Files live in:
- Global: `~/.agents/agents/code-reviewer/AGENT.md`
- Project: `.agents/agents/code-reviewer/AGENT.md`

### Using an Agent

In the chat, the model can spawn the agent:

```
You: "Review the auth module for security issues"

Agent spawns: "Researcher" sub-agent
  → agent reads src/auth/*.ts
  → agent runs grep for common patterns
  → agent returns summary

You see: "[Running Code Reviewer] → Found 3 issues: ..."
Main agent continues with the findings
```

### Management UI

Settings → Agents panel:
- List of installed agents
- "Build with AI" button → scaffolds new agent with Claude's suggestions
- Delete / inspect definitions
- Backend indicators (Claude SDK vs Pi)

---

## Why This Works Technically

### Anthropic Backend (Claude SDK)

The Claude Agent SDK natively supports sub-agents. We'd:

1. Parse `AGENT.md` files → `AgentDefinition` objects
2. Pass them to `query()` as `agents: { researcher: {...}, ...}`
3. When the model calls the `Agent` tool (renamed from `Task`), the SDK handles the rest
4. Multiple agents can run **in parallel** from a single model response
5. Results stream back into the main conversation

**Why it's feasible:** The SDK already does this. We just format our agent files to match its expectations.

### Pi Backend (GitHub Copilot, ChatGPT, Ollama)

Pi doesn't have native sub-agent support, but we can build it:

1. Parse the same `AGENT.md` files
2. Create a custom `Agent` tool that Pi's model can call
3. Tool execution:
   - Spins up a new `AgentSession` in-process
   - Feeds the agent's system prompt + restricted tools
   - Runs the sub-task
   - Returns the result to the parent
4. Multiple agents run **in parallel** if the parent response includes multiple Agent calls

**Why it's feasible:** Pi's SDK supports custom tools with streaming. We just nest sessions.

---

## Key Benefits

### 1. **Context Budget** (biggest win)

Without agents: A read-only task like "analyze all error handlers" reads 50 files, each tool call gets stored in context forever.

With agents: The Researcher sub-agent does the work (50+ tool calls, 40K tokens), but the main agent only sees: "Found 15 error handlers, here are the patterns."

Real savings: **~40K context tokens freed up** for actual reasoning work.

### 2. **Safety**

- Tool restrictions prevent accidents (read-only agent can't write)
- Specialized instructions reduce hallucination (migration agent knows your schema patterns)
- Failure isolation (sub-agent hits error → main agent handles it, session continues)

### 3. **Cost**

- Delegate to cheaper models (`haiku` for reading, `sonnet` for deciding)
- Example: use `haiku` ($0.80/1M input) for research, keep `opus` ($15/1M input) for main reasoning

### 4. **Parallelism**

Both backends can execute multiple agents concurrently from one response. Same work, faster completion.

### 5. **Reusability**

Define once, use across sessions and projects. Share agent definitions with teammates.

---

## Questions & Unknowns

These are intentionally left open for discussion:

1. **Agent discovery & visibility**
   - Should agents appear as options in a UI menu or only be discoverable in code?
   - Should main agent know what agents are available (system prompt injection)?
   - How do we prevent agent name collisions (global vs project)?

2. **Tool filtering complexity**
   - Do we support regex patterns or wildcards (`bash:*` for read-only bash)?
   - Should we auto-generate restricted versions (e.g., `Grep` vs `Grep-readonly`)?
   - How granular should restrictions be (command allowlists for bash)?

3. **Permission & safety**
   - Should sub-agents inherit the session's permission mode (Plan/Ask/Auto) or override it?
   - Should we enforce stronger restrictions (read-only agents always in Plan mode)?
   - Multi-agent coordination — if Agent A runs first, can Agent B see its outputs?

4. **UI/UX**
   - How should nested agent calls appear in the chat? Tree view? Expandable sections?
   - Should users be able to manually invoke an agent, or only let the model decide?
   - Progress indicators for parallel agents?

5. **Observability**
   - Should sub-agent tool calls be fully visible or summarized?
   - How much token usage breakdown per agent?

6. **Fallback for Pi**
   - If Pi can't run an agent for some reason, what's the degradation path?
   - Should the main model be told "Agent X unavailable on this backend"?

---

## Rough Implementation Phases

**Phase 1: Anthropic Foundation**
- Parse AGENT.md files
- Wire into Claude SDK's `agents:` option
- Settings panel to list agents
- Test with 2–3 built-in agents

**Phase 2: Pi Support**
- Implement custom `Agent` tool for Pi sessions
- Verify parallelism works
- Add backend indicator to UI

**Phase 3: Polish & Safety**
- "Build with AI" dialog to scaffold agents
- Validation/linting for agent definitions
- Stronger tool restrictions if needed

**Phase 4: Enhancements** (if justified by usage)
- Agent chaining (Agent A's output → Agent B's input)
- Conditional agent dispatch (model chooses based on context)
- Agent marketplace / community sharing

---

## Rationale

This feature mirrors the existing **Skills** system (file-based, global + project, @-mention interface) but extends it to runtime behavior. The analogy:
- **Skills** = read-only reference tools
- **Agents** = delegated work

Both solve the same pattern: reusable, composable capabilities without cluttering the UI.

The technical feasibility is high because both backends already support (or can support) sub-agent execution. We're not inventing a new model capability — we're wrapping existing infrastructure and making it discoverable.

---

## Next Steps

1. **Feedback:** Which benefits matter most? Which open questions should we resolve first?
2. **Prioritization:** Does this fit the current roadmap, or should it wait for other features?
3. **Prototyping:** If approved, start with Anthropic backend only (lower risk, higher adoption).
4. **Design:** Resolve at least questions 1–3 before coding (affects AGENT.md format and system prompts).
