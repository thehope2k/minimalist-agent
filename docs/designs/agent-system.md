# Agent System Design

**Status:** Phase 1 Complete — Backend ready, UI coming next

---

## Overview

Currently, Minimalist Agent has one persona per session (the model you're talking to). The **Agent System** enables defining specialized sub-agents that can be spawned within a session to handle focused tasks.

### Examples

- **Researcher** — Read-only agent that analyzes code and documentation without risking edits
- **Test Runner** — Agent with only Bash, confined to `test/` directory
- **API Explorer** — Agent with web fetch and grep, no write permission, for investigating APIs
- **Code Reviewer** — Agent with custom system prompt teaching patterns, cheaper model for cost

Instead of the main agent trying to do all jobs, you delegate specific work to specialized agents. Each has:
- A **custom system prompt** tailored to its role
- **Restricted tools** (read-only, write-only, specific commands)
- Optional **model choice** (cheaper model for simple tasks)
- **Isolation** — sub-agent's tool calls don't bloat the main context window

---

## User Experience

### Creating an Agent

Similar to Skills, you create an `AGENT.md` file:

```markdown
---
name: Code Reviewer
description: Reads code and identifies issues. Never writes.
model: haiku  # optional, cheaper model for review
tools: [Read, Grep, Find, WebFetch]  # restricted set
maxTurns: 10
permissionMode: plan  # optional
---

You are a code review expert. Your job is to:
- Identify potential bugs
- Flag performance issues
- Spot security concerns
- Suggest improvements

Never write or modify files. Always explain your reasoning.
```

**All agents are global:**
```
~/.agents/agents/code-reviewer/AGENT.md
~/.agents/agents/researcher/AGENT.md
...
```

**Scope:** Global only (consistent with Skills & Extensions). Users name distinctly if they want project-specific variations.

### Using an Agent

The model automatically sees available agents in the system prompt:

```xml
<agents>
Enabled:
- researcher (model: haiku, tools: Read/Grep/Find): Reads and analyzes code
- code-reviewer (model: haiku, tools: Read/Grep): Reviews for issues
- refactor-planner (model: sonnet, tools: Read/Edit): Plans refactoring

Agents are invoked automatically by the model when needed.
</agents>
```

When you ask the model to delegate, it decides to use an agent:

```
You: "Review the auth module for security issues"

Model says: "I'll use the code-reviewer agent"
  ↓
Claude SDK spawns: Code Reviewer sub-agent
  → agent reads src/auth/*.ts
  → agent runs grep for patterns
  → agent returns findings
  ↓
You see: "Code Reviewer found 3 issues: [list]"

Main agent uses the findings to continue
```

**Key:** The model sees agent metadata upfront and decides when to use them (not user-controlled like Skills).

### Management UI

Top-level **Agents** tab (same level as Skills and Extensions):
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

## Decisions Made (Phase 1)

### ✅ Scope: Global-Only
- All agents live in `~/.agents/agents/`
- Consistent with Skills and Extensions (simpler mental model)
- Users name distinctly if they need project-specific variations
- No project-local complexity

### ✅ Discovery: System Prompt Injection
- Agents surface via `<agents>` XML block in system prompt
- Model sees them automatically (like `<extensions>` block)
- Not in @mention picker (different pattern than Skills)
- Transparent and discoverable upfront

### ✅ Architecture: SDK Native
- Anthropic: Use Claude SDK's native Agent tool (Phase 1)
- Pi: Custom `Agent` tool wrapper (Phase 2)
- No bundled agents (users define their own — minimalist)

### ✅ IPC Endpoints: 9 Simple
```
Agents:list() → LoadedAgent[]
Agents:get(slug) → LoadedAgent
Agents:delete(slug) → bool
Agents:validate(path, slug) → {ok, report}
Agents:getDir() → path
Agents:listFiles(path) → tree
Agents:openInEditor(path) → void
Agents:revealInFinder(path) → void
Agents:invalidateCache() → void
```

### ✅ UI Tier: Phase 2
- Top-level Agents tab (list, delete, inspect)
- "Build with AI" dialog (scaffold with Claude)
- Agent details page (prompt + metadata)

---

## Open Questions (Phase 2+)

These can be revisited if usage demands:

1. **Nested UI visibility**
   - How should sub-agent tool calls appear in chat?
   - Tree view? Expandable sections? Collapsible summary?

2. **Tool filtering edge cases**
   - Regex patterns or wildcards (e.g., `bash:*` for read-only bash)?
   - Auto-generate restricted tool variants?
   - Command allowlists for specific tools?

3. **Permission inheritance**
   - Should sub-agents inherit session permission mode (Plan/Ask/Auto)?
   - Should we enforce stronger restrictions for read-only agents?

4. **Manual invocation**
   - Should users be able to manually trigger agents (vs model-only)?
   - Useful for testing / debugging?

5. **Pi fallback strategy**
   - If agent unavailable on Pi backend, graceful degradation?
   - Inform model: "Agent X only available on Anthropic"?

6. **Observability**
   - How detailed should sub-agent tool calls be shown?
   - Token usage breakdown per agent?

## Implementation Status

**Phase 1: Core Backend** ✅ **COMPLETE**
- Parse AGENT.md files → LoadedAgent model
- Wire into Claude SDK's `agents:` option
- System prompt injection (`<agents>` block)
- 9 IPC endpoints for CRUD + utilities
- 5-minute cache + invalidation
- Validation with helpful errors

**Phase 2: UI** ✅ **IMPLEMENTED**
- Top-level Agents tab (list, delete, inspect)
- "Build with AI" dialog (scaffold agents with Claude)
- Agent detail page (show prompt + metadata)

**Phase 3: Polish** 💯 **FUTURE**
- Nested sub-agent visibility in chat tree
- Manual invocation UX (optional)
- Advanced validation + lint hints

**Phase 4: Pi Support** 🔨 **LATER**
- Custom `Agent` tool wrapper for Pi sessions
- Feature parity with Anthropic backend

**Phase 5+: Enhancements** (if justified)
- Agent marketplace / sharing
- Agent versioning
- Stronger tool filtering
- Manual agent invocation UI
- Agent chaining (Agent A's output → Agent B's input)
- Conditional agent dispatch (model chooses based on context)
- Agent marketplace / community sharing

---

## Rationale

This feature mirrors the existing **Skills** system (file-based, global scope, no @-mention needed) but extends it to runtime behavior. The analogy:
- **Skills** = read-only reference tools (@mention to invoke)
- **Agents** = delegated work (model-invoked automatically)

Both solve the same pattern: reusable, composable capabilities without cluttering the UI.

The technical feasibility is high because both backends already support (or can support) sub-agent execution. We're not inventing a new model capability — we're wrapping existing infrastructure and making it discoverable via system prompt injection.

The system prompt injection approach is consistent with how `<extensions>` and `<working_directory>` blocks surface context — using XML tags for clarity and structure.

---

## Final Status

**Phase 1 backend is complete and ready for testing.** System prompt injection is live. Users can already create agents and the model will see them in the `<agents>` block.

**Phase 2 core UI is implemented** with a dedicated top-level Agents tab + Build with AI flow.

Next: validate end-to-end behavior and polish nested visibility.
