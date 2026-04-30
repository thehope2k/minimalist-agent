/**
 * Bundled reference doc for Extensions. Materialized to
 * `<userData>/docs/extensions.md` on app boot. Bump the version when the
 * content changes; the install pass overwrites stale copies.
 */

export const EXTENSIONS_REFERENCE_VERSION = '0.1.2';

export const EXTENSIONS_REFERENCE_MD = `# Extensions

Extensions add capabilities to the agent. There are three variants, and you don't
have to pick one up front — the variant is whatever \`extension.json\` declares:

| Variant       | Adds                                       | extension.json shape           |
|---------------|--------------------------------------------|---------------------------------|
| guide-only    | A how-to that nudges the agent's behavior  | no \`env\`, no \`mcp\`           |
| cli-bound     | A CLI + credentials wired into Bash        | \`env\` block                    |
| mcp-backed    | An MCP server with structured tools        | \`mcp\` block                    |

## Folder layout

Each extension is a folder under \`<userData>/extensions/<slug>/\` with two
required files:

\`\`\`
<slug>/
  extension.json     # config (this is the source of truth)
  guide.md           # how the agent should use it
  icon.{png|svg|…}   # optional
\`\`\`

## extension.json

\`\`\`jsonc
{
  "schemaVersion": 1,
  "slug": "linear",
  "name": "Linear",
  "description": "Issue tracking",
  "enabled": true,                           // optional, default true
  "version": "0.1.0",
  "icon": "🟣",                               // optional
  "tags": ["pm", "issues"],

  // cli-bound or mcp-backed: env values can be literal or a SecretRef.
  "env": {
    "LINEAR_API_KEY": { "secret": "linear.apiKey" }
  },

  // mcp-backed only:
  "mcp": {
    "transport": "stdio",
    "command": "npx",
    "args": ["-y", "@linear/mcp-server"],
    "envFromBinding": true
  },

  // optional:
  "permissions": {
    "tools": ["bash", "read", "mcp__linear__*"],
    "commandPrefixes": ["linear"],
    "networkHosts": ["api.linear.app"]
  },

  // optional, set automatically when the agent drafts an extension:
  "provenance": {
    "createdBy": "agent",
    "sources": [
      { "url": "https://linear.app/docs", "fetchedAt": "2026-05-02T..." }
    ]
  }
}
\`\`\`

## guide.md

Markdown with optional YAML frontmatter (overrides display fields). Body should
explain how the agent should use the extension — preferred commands, naming
conventions, things to avoid.

\`\`\`markdown
---
name: Linear
description: Issue tracking
icon: 🟣
---

## How to use

- Use the \`linear\` CLI for issue read/write.
- Always pass \`--team eng\` unless told otherwise.

## Don't

- Never use \`linear delete\` without explicit user confirmation.
\`\`\`

## When the agent uses an extension

Every user turn includes an \`<extensions>\` awareness block listing all
installed extensions and their guide paths. Before invoking an extension's
tools or running its CLI for the first time in a session, the agent must
read \`guide.md\` to understand correct usage.

## Variants in detail

### Guide-only

No \`env\`, no \`mcp\`. The agent uses existing built-in tools (Bash / Read)
following your guide. Best fit when no credentials are needed and the agent
only needs prose nudging — an internal SOP, a "how we use git" reference, a
coding-style note, or a CLI that's already configured outside the app.

### CLI-bound

\`env\` block declares variables that get exported into Bash invocations.
Use \`{ "secret": "<key>" }\` to pull from the secret store rather than
inlining values. Best fit when there's a well-maintained CLI for the service
and calling it from Bash is straightforward — \`gh\`, \`aws\`, \`vercel\`,
\`kubectl\`, etc.

### MCP-backed

\`mcp\` block configures a Model Context Protocol server. Stdio servers are
spawned as subprocesses; HTTP/SSE servers are connected over the network.
Tools exposed by the server appear to the agent as \`mcp__<slug>__<toolname>\`.
Best fit when the service ships an official MCP server, or has no good CLI
and you'd benefit from typed tool calls — Linear, Notion, etc.

### Choosing a variant

Pick the one that actually fits the service. Don't default to "simpler is
better" — a real MCP server gives the agent typed tools, which is often a
better experience than parsing CLI output. Conversely, wrapping a great CLI
in MCP is unnecessary overhead. When two variants are both reasonable, the
agent should ask the user.

> **Anthropic-only.** MCP servers are spawned by the Claude Agent SDK and only
> reach Anthropic-backed sessions. Pi-backed sessions skip mcp-backed
> extensions silently — \`guide-only\` and \`cli-bound\` variants work on
> both backends.

## Creating extensions in chat

Click "+ New Extension" or ask the agent: "connect Linear" / "add an aws-iac
extension". The agent will research the integration, draft \`extension.json\`
and \`guide.md\`, write them to disk, and verify they work.

## Disabling

Toggle \`enabled\` in extension.json (or use the UI toggle). Disabled
extensions are skipped from the prompt awareness block and won't have their
MCP servers spawned.
`;
