export const AGENTS_REFERENCE_VERSION = '1.0.0';

export const AGENTS_REFERENCE_MD = `# Agents Reference

This guide explains how to create, configure, and validate agents in Minimalist Agent.

## What Are Agents?

Agents are specialized sub-agents that the main agent can spawn to handle focused tasks. They run with restricted tools, models, or permissions, and return results to the main agent.

**Key facts:**
- Agents live as folders under \`<userData>/agents/<slug>/\`.
- Each folder must contain an \`AGENT.md\` file with YAML frontmatter and a markdown body (system prompt).
- Agents are invoked automatically by the model when it decides to delegate work.
- The agent's system prompt tells it what to do and how to behave.

## AGENT.md Format

\`\`\`markdown
---
name: "Code Reviewer"
description: "Analyzes code for bugs, performance, and security issues."
model: claude-haiku-4.5           # Optional: override session model (use full model ID)
tools: [Read, Grep, Find]         # Optional: restrict to specific tools
maxTurns: 10                       # Optional: max turns before stopping
permissionMode: plan               # Optional: plan (read-only) or auto (intelligent execution)
effort: low                        # Optional: Anthropic reasoning effort
icon: "🔍"                         # Optional: emoji or URL
---

# System Prompt

Your agent instructions go here. This is the agent's "job description" — what it should do, how it should behave, and what it should avoid.

## Example sections

- Step-by-step process
- Guidelines and constraints
- Output format
- Things to avoid
\`\`\`

## Frontmatter Fields

### Required

- **\`name\`** — Display name for the agent (shown in UI)
- **\`description\`** — Brief summary of what the agent does (used by the LLM to decide when to spawn it)

### Optional

- **\`model\`** — Model override. If omitted or set to \`session-default\`, inherits the session model.
  
  **Valid model IDs** (May 2026 - varies by your active connection):
  - **OpenAI**: \`gpt-5.5\`, \`gpt-5.4\`, \`gpt-5.4-mini\`, \`gpt-5.3-codex\`, \`gpt-5-mini\`
  - **Anthropic**: \`claude-opus-4.7\`, \`claude-opus-4.6\`, \`claude-sonnet-4.6\`, \`claude-haiku-4.5\`
  - **Google**: \`gemini-3.5-flash\`, \`gemini-3.1-pro\`, \`gemini-2.5-pro\`
  - **Custom endpoints**: any model your server supports
  
  **Notes:**
  - Agents are global and work with any connection (GitHub Copilot, ChatGPT Plus, custom endpoints)
  - Model availability depends on your active connection at runtime
  - Use \`session-default\` to explicitly inherit the session model (same as omitting the field)
  
  ⚠️ **Use full model IDs only** — short names like \`sonnet\` or \`haiku\` will fail at runtime. Model availability changes over time; check provider documentation for the latest.
- **\`tools\`** — Array of allowed tool names. If omitted, inherits all session tools.
  - Built-in tools: \`Read\`, \`Write\`, \`Edit\`, \`Bash\`, \`Grep\`, \`Glob\`, \`Find\`, \`Ls\`, \`WebFetch\`, \`WebSearch\`, \`Agent\`
  - Example: \`[Read, Grep, Find]\` for read-only work
- **\`maxTurns\`** — Maximum number of turns before agent stops (default: 10)
- **\`permissionMode\`** — Controls mutation permissions:
  - \`plan\` — Read-only, no file writes or mutations
  - \`auto\` — Intelligent execution with autonomy-based collaboration (controlled by session autonomy level)
- **\`effort\`** — Anthropic only: reasoning effort level (\`low\`, \`medium\`, \`high\`)
- **\`icon\`** — Visual identifier (emoji like \`🔍\` or URL)

## System Prompt (Body)

The markdown content after the frontmatter is the **system prompt** — instructions that tell the agent what to do.

**Guidelines:**

1. **Be specific** — "Review for security issues" is vague; "Flag SQL injection, XSS, insecure crypto" is clear
2. **Teach patterns** — Show examples of the output you want
3. **Set boundaries** — "Never modify files" or "Always return findings as a list"
4. **Context first** — "Read the full context before analyzing"
5. **Escalation** — "If task is too complex, summarize findings and return"

## Examples

### Read-only Researcher

\`\`\`markdown
---
name: Code Researcher
description: Reads and analyzes code. Never writes.
tools: [Read, Grep, Find, Ls, WebFetch, WebSearch]
permissionMode: plan
maxTurns: 15
icon: "🔍"
---

You are a code researcher. Your job is to read and understand code, then explain what you found.

When analyzing:
1. Start with a broad scan (Grep for patterns, Find relevant files)
2. Read key files fully (imports, types, main logic)
3. Trace dependencies and call sites
4. Summarize findings clearly with file paths and line numbers

Never modify files. Always return your analysis in a structured format:
- **Summary** — What the code does
- **Key Files** — Important files and their roles
- **Patterns** — Architectural patterns, conventions
- **Concerns** — Potential issues or areas needing attention
\`\`\`

### Refactor Planner

\`\`\`markdown
---
name: Refactor Planner
description: Plans code changes step-by-step before executing.
model: claude-sonnet-4.6
tools: [Read, Bash, Edit]
maxTurns: 20
permissionMode: plan
---

You are a refactor planner. Your job is to plan code changes carefully before executing them.

Process:
1. **Analyze** — Read the current code, understand structure and dependencies
2. **Plan** — Break the refactor into small, safe steps
3. **Validate** — For each step, explain why it's safe and what could break
4. **Propose** — Present the complete plan for user review

When planning:
- Prefer small, incremental changes over big rewrites
- Preserve existing tests and behavior
- Update tests when interfaces change
- Run tests after each step

If a refactor is risky or complex, present the plan and ask for confirmation before proceeding.
\`\`\`

### Test Validator

\`\`\`markdown
---
name: Test Validator
description: Validates test quality and coverage.
tools: [Read, Bash, Grep]
maxTurns: 10
permissionMode: plan
effort: low
---

You are a test validator. Review tests for quality and coverage.

Check for:
1. **Coverage** — Are edge cases tested? (null, empty, boundary values)
2. **Clarity** — Are test names descriptive? ("should handle empty array" not "test1")
3. **Isolation** — Does each test set up its own state?
4. **Assertions** — Are they specific? (check exact values, not just truthiness)
5. **Performance** — Are there unnecessary sleeps or retries?

Output format:
- **Summary** — Overall test quality score (Poor / Fair / Good / Excellent)
- **Issues** — List of specific problems with file:line references
- **Suggestions** — Concrete improvements

Never modify tests. Always return findings as a structured report.
\`\`\`

## Best Practices

1. **Single Responsibility** — One agent per job. A reviewer reviews; it doesn't fix.
2. **Minimal Tools** — Give only the tools needed. Read-only agents shouldn't have \`Write\`.
3. **Clear Description** — The LLM uses this to decide when to spawn the agent.
4. **Explicit Constraints** — "Never modify files" or "Always ask before writing".
5. **Structured Output** — Teach the agent how to format its results.

## Storage Locations

Agents are stored globally (available in all projects):

\`\`\`
~/.agents/agents/<slug>/AGENT.md
\`\`\`

Each agent lives in its own directory. The directory name (slug) is the agent identifier and must be:
- Lowercase alphanumeric with hyphens
- 1-30 characters
- Start and end with alphanumeric

**Examples:**
- \`code-reviewer\`
- \`refactor-planner\`
- \`test-validator\`

## Validation

The Agents UI provides a "Validate" button that checks:
- YAML syntax in frontmatter
- Required fields present (\`name\`, \`description\`)
- Valid field types (e.g., \`tools\` is an array, \`maxTurns\` is a number)
- Non-empty system prompt (body content)

Invalid agents won't be offered to the model.

## Editing Agents

To edit an agent:
1. Go to the Agents tab in the UI
2. Click the agent card
3. Click "Open in editor" from the menu
4. Edit \`AGENT.md\` in your text editor
5. Save and close
6. Changes take effect immediately (no restart needed)

Alternatively, edit files directly:
\`\`\`bash
\$EDITOR ~/.agents/agents/my-agent/AGENT.md
\`\`\`

## Creating Agents

### Via UI (Recommended)

1. Click the "New Agent" button in the Agents tab
2. Describe what the agent should do
3. Click "Build Agent"
4. The model creates the \`AGENT.md\` file for you
5. Review and refine as needed

### Manually

Create the directory and file:

\`\`\`bash
mkdir -p ~/.agents/agents/my-agent
cat > ~/.agents/agents/my-agent/AGENT.md << 'EOF'
---
name: My Agent
description: Does something specific
tools: [Read, Grep]
permissionMode: plan
---

Your system prompt instructions here...
EOF
\`\`\`

Click "Refresh" in the Agents UI to see it.

## When Are Agents Used?

The model decides when to spawn an agent based on:
1. **Task complexity** — Delegate focused sub-tasks
2. **Tool restrictions** — Spawn a read-only agent for analysis
3. **Cost optimization** — Use a cheaper model (haiku) for simple work
4. **Safety** — Use \`plan\` mode for read-only exploration

You don't manually invoke agents. The model sees the list of available agents (name + description) in its system prompt and decides when to use them.

## Troubleshooting

**Agent not appearing in list?**
- Check YAML syntax (validate in the UI)
- Ensure required fields are present (\`name\`, \`description\`)
- Ensure \`AGENT.md\` is in \`~/.agents/agents/<slug>/\`
- Click "Refresh" in the Agents UI

**Agent not being used by model?**
- Make \`description\` more specific (model uses it to decide)
- Ensure agent's capabilities match the task (tools, permissions)
- Try asking explicitly: "Use the code-reviewer agent to analyze this"

**Agent stops too early?**
- Increase \`maxTurns\` in frontmatter
- Check if agent hit a permission block (try \`permissionMode: auto\`)

**Agent using wrong model?**
- Set \`model\` field explicitly (e.g., \`model: haiku\`)
- If omitted, agent inherits session model
`;
