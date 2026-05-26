# AGENT.md Format Reference

An `AGENT.md` file defines a reusable sub-agent that can be spawned by the main agent to handle focused tasks. Similar to `SKILL.md`, it combines YAML frontmatter (metadata) with markdown body (system prompt).

## Storage Locations

```
~/.agents/agents/<slug>/AGENT.md      # Global — available in all projects
<cwd>/.agents/agents/<slug>/AGENT.md  # Project-local — overrides global with same slug
```

The directory name (slug) is the agent identifier. Project agents shadow global agents with the same slug.

## Frontmatter (YAML)

Required fields:

```yaml
name: "Research Agent"
description: "Reads and analyzes code. Never writes."
```

Optional fields:

```yaml
model: haiku                      # Override session model (e.g., haiku, sonnet, opus)
tools:                            # Restrict agent to specific tools
  - Read
  - Grep
  - Find
  - Ls
  - WebFetch
  - WebSearch

maxTurns: 15                       # Max turns before agent stops (default: 10)
permissionMode: plan               # plan, ask, or auto (controls mutation permissions)
effort: low                        # Anthropic only: low, medium, or high
icon: "🔍"                         # Emoji or URL (auto-downloaded as icon.{ext})
```

## Body (Markdown)

The content after the frontmatter is the **system prompt** — instructions that tell the agent what to do and how to behave.

**Examples:**

```markdown
---
name: Code Reviewer
description: Analyzes code for bugs, performance, and security issues.
tools: [Read, Grep, Find, WebFetch]
maxTurns: 10
---

You are an expert code reviewer. Your responsibilities:

1. **Bug Detection** — Look for logic errors, null pointer risks, and unhandled exceptions
2. **Performance** — Identify O(n²) loops, unnecessary allocations, inefficient algorithms
3. **Security** — Flag SQL injection risks, XSS vectors, insecure crypto, privilege escalation
4. **Maintainability** — Suggest clearer names, extracted functions, reduced cyclomatic complexity

When reviewing:
- Read the full context first (imports, types, calling code)
- Explain *why* something is a concern, not just that it is
- Suggest concrete fixes
- Respect existing patterns in the codebase

Never modify files. Always present findings as a list with line numbers and explanations.
```

Another example — migration helper:

```markdown
---
name: Database Migrator
description: Plans and validates database schema migrations.
model: sonnet
tools: [Read, Bash, Grep]
maxTurns: 20
permissionMode: plan
---

You are a database migration specialist. Your role:

1. Understand the current schema (read `schema.sql`, migrations history)
2. Propose a safe migration plan with:
   - Step-by-step SQL changes
   - Data backfill queries if needed
   - Rollback procedures
3. Validate compatibility (check foreign keys, constraints, triggers)

Always provide migration scripts as separate `.sql` files, never inline.
Include comments explaining the reasoning for each change.
```

## Field Semantics

### `model`

If set, the sub-agent uses this model instead of the session's model. Useful for cost optimization:

```yaml
model: haiku  # Use cheaper model for simple read-only tasks
```

Omit to use the session's current model.

### `tools`

Tool names must match built-in tools from the `claude_code` preset:

- `Read`, `Write`, `Edit` — file operations
- `Bash`, `Grep`, `Glob`, `Find`, `Ls` — shell & search
- `WebFetch`, `WebSearch` — web access
- `Agent` — spawn another sub-agent

**Omit to allow all tools.** Set restrictively for safety:

```yaml
tools: [Read, Grep, Find]  # Read-only research agent
```

### `maxTurns`

Maximum number of model turns. Defaults to 10. Increase for complex tasks:

```yaml
maxTurns: 25  # Complex migration planning
```

### `permissionMode`

Controls what the agent can do:

- `plan` — No file mutations; agent can only read and analyze
- `ask` — Agent asks for permission before each mutation (tool call)
- `auto` — Agent can write freely without asking

If omitted, inherits from the session. Use `plan` for read-only agents:

```yaml
permissionMode: plan
```

### `effort`

**Anthropic-only** — controls reasoning depth and cost:

- `low` — Fast, cost-effective
- `medium` — Balanced
- `high` — Deep reasoning, thorough analysis

```yaml
effort: low  # Quick grep + summarize
```

### `icon`

Visual identifier in the UI. Use an emoji (preferred) or a URL:

```yaml
icon: "🔍"                    # Emoji
icon: "https://example.com/researcher.png"  # URL — downloaded once to icon.png
```

## Best Practices

1. **Single Responsibility** — One agent per job. `Code Reviewer` reviews, doesn't fix.
2. **Clear Description** — Used by the LLM to decide whether to spawn this agent.
3. **Tool Restrictions** — Give the minimum tools needed. `plan` mode for read-only.
4. **Specific Prompts** — Teach the agent your patterns, domain knowledge, preferences.
5. **Escalation** — If a task is too complex, the agent should return findings for the main agent to decide next steps.

## Examples

See `~/.agents/agents/` after first launch for bundled agents:

- `researcher` — reads and analyzes code/docs without writing
- `refactor-planner` — plans code changes before executing
- `test-validator` — validates test quality

Create your own by copying the structure:

```bash
mkdir -p ~/.agents/agents/my-agent
cat > ~/.agents/agents/my-agent/AGENT.md << 'EOF'
---
name: My Agent
description: Does something specific
---

Your instructions here...
EOF
```

## Validation

The Settings UI provides a "Validate" button that checks:

- YAML syntax
- Required fields (`name`, `description`)
- Valid field types
- Non-empty system prompt

Invalid agents won't be offered to the model.

## Versioning

Agents are versioned implicitly via their file path and content. To update an agent, edit its `AGENT.md`. Changes take effect immediately.

To create a variant without overwriting, create a new directory:

```
~/.agents/agents/code-reviewer/         # main
~/.agents/agents/code-reviewer-strict/  # variant with harsher rules
```
