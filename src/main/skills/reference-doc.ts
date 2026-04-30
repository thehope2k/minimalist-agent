export const SKILLS_REFERENCE_VERSION = '1.0.0';

export const SKILLS_REFERENCE_MD = `# Skills Reference

This guide explains how to create, edit, and validate skills in Minimalist Agent.

## What Are Skills?

Skills are reusable instruction sets that extend Claude's behavior for specific
tasks. They use the **same SKILL.md format as the Claude Code SDK**, so a skill
written for any Claude-powered tool works here as-is.

**Key facts:**
- Skills live as folders under \`<userData>/skills/<slug>/\`.
- Each folder must contain a \`SKILL.md\` file with YAML frontmatter and a
  markdown body.
- Skills are invoked via the \`[skill:<slug>]\` mention in chat (or by
  selecting them from the \`@\` picker in the composer).
- When invoked, the agent is instructed to read the SKILL.md file before
  doing anything else, and follow the body's instructions.

There is no automatic glob-based triggering, no per-project tier, and no
precedence rules. One global location, one mention to invoke.

## SKILL.md Format

\`\`\`markdown
---
name: "Skill Display Name"
description: "Brief one-line summary of what the skill does"
globs: ["*.ts", "*.tsx"]      # Optional, informational only
alwaysAllow: ["Bash"]          # Optional, informational only
icon: "🛠️"                     # Optional emoji or https URL
---

# Body — markdown instructions

Your skill content goes here. The agent reads this when the skill is invoked
and follows whatever the body says.

## Example sections

- Step-by-step instructions
- Tone or style guidelines
- Things to avoid
- Sample outputs the agent should match
\`\`\`

## Frontmatter Fields

### \`name\` (required)
Human-readable display name shown in the Skills panel and the @-mention picker.

### \`description\` (required)
One-line summary (≤140 chars) describing what the skill does. Shown alongside
the name in lists.

### \`globs\` (optional)
Array of glob patterns this skill is *thematically* relevant to. Stored for
future use; **not enforced in v1** — skills only fire when explicitly mentioned.

\`\`\`yaml
globs:
  - "*.test.ts"
  - "**/__tests__/**"
\`\`\`

### \`alwaysAllow\` (optional)
Array of tool names the skill expects to use. Stored for future use;
**not enforced in v1** — the standard permission gate still applies.

\`\`\`yaml
alwaysAllow: ["Bash", "Write"]
\`\`\`

### \`icon\` (optional)
Either an emoji (\`"🚀"\`) or an absolute https URL. Emojis render directly;
URLs are downloaded to \`icon.{ext}\` next to SKILL.md the first time the
skill is loaded. Inline SVG and relative paths are not supported.

## Slug Rules

The slug is the folder name and is used in the \`[skill:<slug>]\` mention.

- Lowercase letters, digits, and hyphens only.
- Must start and end with an alphanumeric character.
- Maximum 30 characters.
- No spaces, underscores, or uppercase.

Valid: \`commit\`, \`sql-explainer\`, \`pr-reviewer\`
Invalid: \`Commit\`, \`sql_explainer\`, \`-leading-hyphen\`, \`a..b\`

## Body Conventions

The body becomes part of Claude's instructions whenever the user invokes the
skill. Treat it like a small system prompt scoped to one task.

- **Be specific.** "Format the diff in conventional-commits style" beats
  "write a good commit message".
- **Show, don't tell.** Include 1–2 example inputs/outputs whenever you can.
- **Set boundaries.** Note things the agent should NOT do.
- **Keep it focused.** One skill = one capability. Composing two unrelated
  flows in one skill makes both worse.
- **Use the agent's voice.** "When invoked, you …" reads naturally to Claude.

## Creating a Skill

1. Create the folder: \`<userData>/skills/<slug>/\`.
2. Write \`SKILL.md\` with valid frontmatter and a non-empty body.
3. Optionally add an icon file (\`icon.svg\`, \`icon.png\`, \`icon.jpg\`,
   \`icon.jpeg\`, \`icon.webp\`, \`icon.gif\`) — or set \`icon: "🛠️"\` in
   the frontmatter for an emoji.
4. The Skills panel auto-refreshes after a chat turn ends; otherwise click
   the refresh icon in the panel header.

## Example: Commit Skill

\`\`\`yaml
---
name: "Commit"
description: "Create conventional-commit messages from a diff"
icon: "📝"
---

# Commit Message Generator

When invoked, you generate a single conventional-commit-style message for
the staged changes.

## Format

- Subject line under 72 chars, imperative mood, lowercase type prefix.
- Types: \`feat\`, \`fix\`, \`docs\`, \`refactor\`, \`test\`, \`chore\`.
- Optional body explaining *why*, separated by a blank line.

## Examples

Diff: adds null check on user.email before send → \`fix: handle null email in mailer\`
Diff: rewrites auth/state.ts using zod → \`refactor: replace ad-hoc auth schema with zod\`

## Avoid

- Do not invent changes that aren't in the diff.
- Do not include "WIP" or "tmp" in messages.
\`\`\`

## Validating a Skill

After writing or editing SKILL.md:

- Open the Skills panel.
- Hover the row → ⋯ menu → **Validate**.

Validation checks:
- Slug format
- Frontmatter parses as valid YAML
- \`name\` and \`description\` are non-empty strings
- Body has content
- Icon format (if present)

## Troubleshooting

**Skill doesn't appear in the panel.**
- Check the folder is at exactly \`<userData>/skills/<slug>/SKILL.md\`.
- Ensure the slug folder name matches the slug rules.
- Click the refresh icon in the Skills panel header.

**\`[skill:slug]\` mention is rejected.**
- The agent error will list the slug. Make sure the SKILL.md parses (run
  Validate). A skill with an unparseable file is silently dropped from the
  list.

**Mention picker doesn't show my skill.**
- Same as above — usually a frontmatter typo (missing \`name\` or
  \`description\`).
`;
