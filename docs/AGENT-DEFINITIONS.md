# Agent Definitions

Reusable agent configurations stored as `AGENT.md` files — spawn specialized sub-agents with custom models, tools, and instructions.

---

## What It Is

An agent definition system that lets you create, configure, and spawn specialized sub-agents for focused tasks. Each agent is a folder containing an `AGENT.md` file with YAML frontmatter (metadata) and markdown body (system prompt).

**Key capabilities:**
- **Global registry** — agents stored under `<userData>/agents/<slug>/` and available across all sessions
- **UI management** — dedicated Agents panel with Build with AI flow for creating agents
- **System prompt injection** — agent awareness block automatically injected into the main agent's system prompt
- **Custom Agent tool** — Pi backend (GitHub Copilot, ChatGPT Plus) includes a specialized Agent tool for spawning sub-agents
- **Nested visibility** — sub-agent progress and transcripts visible in the chat UI

---

## Directory Structure

```
<userData>/
  agents/
    code-reviewer/
      AGENT.md        ← Required: metadata + system prompt
      icon.png        ← Optional: visual identifier
    vulnerability-resolver/
      AGENT.md
      icon.svg
```

Each agent is a self-contained folder with:
- **Required:** `AGENT.md` — YAML frontmatter + markdown body
- **Optional:** `icon.{png,jpg,jpeg,webp,svg,gif}` — displayed in UI

---

## AGENT.md Format

```markdown
---
name: "Code Reviewer"
description: "Performs comprehensive code reviews analyzing bugs, security vulnerabilities, performance issues, maintainability, and best practices."
model: claude-haiku-4.5           # Optional: override session model
tools: [Read, Grep, Find, Ls]     # Optional: restrict to specific tools
maxTurns: 25                       # Optional: max turns (default: 10)
permissionMode: plan               # Optional: 'plan' or 'auto'
---

# Code Review Agent

You are a specialized code review agent. Your job is to analyze code for:

1. **Bugs** — logic errors, edge cases, incorrect assumptions
2. **Security** — vulnerabilities, unsafe patterns, input validation
3. **Performance** — inefficient algorithms, unnecessary operations
4. **Maintainability** — code clarity, naming, structure

## Process

1. Read the specified files
2. Analyze each file systematically
3. Report findings with severity levels
4. Provide actionable recommendations

## Output Format

Return findings as a structured report:
- High-severity issues first
- Include file path, line number, explanation
- Suggest concrete fixes
```

---

## Frontmatter Fields

### Required
- **`name`** — Display name shown in UI
- **`description`** — Brief summary used by the LLM to decide when to spawn this agent

### Optional
- **`model`** — Model override (e.g., `claude-haiku-4.5`, `gpt-5.4-mini`, `gemini-3.5-flash`)
  - If omitted or set to `session-default`, inherits the session model
  - Use full model IDs only (short names like `haiku` will fail)
  - Model availability depends on your active connection at runtime
- **`tools`** — Array of allowed tool names (e.g., `[Read, Grep, Find, Ls]`)
  - Built-in tools: `Read`, `Write`, `Edit`, `Bash`, `Grep`, `Glob`, `Find`, `Ls`, `WebFetch`, `WebSearch`, `Agent`
  - If omitted, inherits all session tools
- **`maxTurns`** — Maximum number of turns before agent stops (default: 10)
- **`permissionMode`** — `plan` (read-only) or `auto` (execution allowed)
  - If omitted, inherits session permission mode
- **`effort`** — Anthropic only: reasoning effort level (`low`, `medium`, `high`)
- **`icon`** — Emoji (e.g., `🔍`) or URL

---

## System Prompt (Body)

The markdown content after the frontmatter is the **agent's system prompt** — instructions that define:
- What the agent should do
- How it should behave
- What constraints or guidelines to follow
- Expected output format

**Tips:**
- Be specific about the agent's role and responsibilities
- Include step-by-step processes when applicable
- Define output format clearly
- Mention things to avoid (anti-patterns, pitfalls)

---

## Creating Agents

### Via UI (Recommended)

1. Open the **Agents** tab in the sidebar
2. Click **New Agent**
3. Click **Build with AI** to have the main agent generate the `AGENT.md` for you
4. Provide a description of what the agent should do
5. Review and edit the generated agent definition
6. Save

### Manually

1. Create a folder under `<userData>/agents/<slug>/`
   - Slug must be lowercase alphanumeric with hyphens (e.g., `code-reviewer`)
2. Create `AGENT.md` with valid frontmatter + body
3. Optionally add `icon.png` or other supported image format
4. The agent appears in the Agents panel automatically

---

## How Agents Are Used

### System Prompt Injection

When an agent is enabled, it appears in the main agent's system prompt:

```
<agents>
Enabled:
- code-reviewer (name: Code Reviewer, model: claude-haiku-4.5, tools: Read/Grep/Find/Ls): Performs comprehensive code reviews analyzing bugs, security vulnerabilities, performance issues, maintainability, and best practices.
- vulnerability-resolver (name: Vulnerability Resolver, model: session-default, tools: all): Analyzes and resolves security vulnerabilities from external reports (Dependabot, SonarQube, OWASP, npm audit).

Use your judgment to balance direct work vs delegation for best performance and quality.

Delegation guidance:
- Prefer delegation when a listed agent is a strong match for the task
- A small amount of upfront context gathering is fine before delegating
- After a sub-agent returns, avoid unnecessary duplicate work
- When delegating, provide clear scope, target files, constraints, and expected output format

Use the Agent tool to delegate focused tasks to specialized sub-agents when it improves outcomes.
</agents>
```

### Spawning Behavior

The main agent decides when to spawn a sub-agent based on:
- Task description match
- Agent's specialized capabilities
- Available tools and model
- Overall efficiency judgment

---

## Architecture

**Storage:**
- `src/main/agents/storage.ts` — load, cache, delete operations
- `src/main/agents/parse.ts` — YAML frontmatter parsing + validation
- `src/main/agents/types.ts` — TypeScript interfaces

**System prompt:**
- `src/main/agent/system-prompt.ts` — builds `<agents>` block from loaded agents

**UI:**
- `src/renderer/src/components/agents/AgentsPanel.tsx` — management UI
- `src/renderer/src/components/agents/AgentInfoPage.tsx` — details view

**Pi backend integration:**
- Custom `Agent` tool definition for GitHub Copilot and ChatGPT Plus connections
- Nested sub-agent visibility in chat UI

---

## Best Practices

**1. Specific roles** — Make each agent focused on one type of task
```yaml
✅ Good: "Analyzes code for security vulnerabilities"
❌ Bad: "General purpose coding assistant"
```

**2. Clear constraints** — Define what the agent should and shouldn't do
```markdown
## Things to Avoid
- Don't make assumptions about missing context
- Don't run code or execute commands
- Don't propose changes without explaining trade-offs
```

**3. Tool restrictions** — Limit tools for safety and clarity
```yaml
tools: [Read, Grep, Find]  # Read-only research agent
```

**4. Output format** — Specify expected structure
```markdown
## Output Format
Return findings as:
1. Summary (2-3 sentences)
2. Detailed findings (bullet list)
3. Recommendations (numbered list)
```

**5. Right-sized models** — Use cheaper/faster models when appropriate
```yaml
model: claude-haiku-4.5  # Fast, cheap, good for code analysis
```

---

## Shipped

- **v0.18.0 (2026-05-27)** — Initial implementation: global registry, UI panel, system-prompt injection, Pi Agent tool, nested sub-agent visibility

See [ROADMAP.md](ROADMAP.md) for details.
