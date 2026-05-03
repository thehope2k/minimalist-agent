/**
 * Bundled reference doc for Extensions. Materialized to
 * `<userData>/docs/extensions.md` on app boot. Bump the version when the
 * content changes; the install pass overwrites stale copies.
 */

export const EXTENSIONS_REFERENCE_VERSION = '0.1.4';

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

  // cli-bound or mcp-backed: env values can be literal OR a SecretRef.
  // ⚠ Credentials (API keys, tokens, passwords) MUST be SecretRefs — never
  // literal strings. See "Secrets" below.
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
Best fit when there's a well-maintained CLI for the service and calling it
from Bash is straightforward — \`gh\`, \`aws\`, \`vercel\`, \`kubectl\`,
etc. Read **Secrets** below before populating \`env\`.

### MCP-backed

\`mcp\` block configures a Model Context Protocol server. Stdio servers are
spawned as subprocesses; HTTP/SSE servers are connected over the network.
Tools exposed by the server appear to the agent as \`mcp__<slug>__<toolname>\`.
Best fit when the service ships an official MCP server, or has no good CLI
and you'd benefit from typed tool calls — Linear, Notion, etc.

## Secrets

> **MUST**: never inline credentials in \`extension.json\`. Any value that
> authenticates the user — API keys, tokens, passwords, signing keys, OAuth
> client secrets, webhook secrets — MUST be a \`SecretRef\` and live in the
> encrypted secret store, not in the JSON file on disk.

### What counts as a credential

If you can answer "yes" to *any* of these, it's a credential:

- Looks like \`ghp_…\`, \`github_pat_…\`, \`gho_…\`, \`ghs_…\` → GitHub token
- Looks like \`sk-…\`, \`sk-ant-…\`, \`sk-proj-…\` → OpenAI / Anthropic API key
- Looks like \`xoxb-…\`, \`xoxp-…\`, \`xoxa-…\` → Slack token
- Looks like \`AKIA…\`, \`ASIA…\` → AWS access key ID (and the matching secret)
- Looks like \`Bearer …\`, \`eyJ…\` (JWT), or any opaque string ≥ 20 chars
  the user wouldn't put in a screenshot
- Anywhere a service's docs say "keep this secret" or "do not commit"

When in doubt, treat it as a credential or ask user.

### Why inlining is wrong

The JSON file lives plaintext on disk under \`<userData>/extensions/<slug>/\`.
That means it's exposed to:

- Backup tools (Time Machine, iCloud, Dropbox sync)
- Shell history (\`cat extension.json\`)
- Screen shares / pair programming sessions
- Anyone who briefly has shell access
- The chat log itself if the user pastes the file content into a turn

The encrypted secret store uses the OS keychain (macOS Keychain / Windows
DPAPI / libsecret). Plaintext only exists in process memory while a turn
is running.

### How to use SecretRefs

In \`extension.json\`, replace the literal value with a reference:

\`\`\`jsonc
// ❌ WRONG — token is plaintext on disk
"env": {
  "GITHUB_TOKEN": "ghp_abc123…"
}

// ✅ RIGHT — JSON only stores the key name; value lives encrypted
"env": {
  "GITHUB_TOKEN": { "secret": "github.token" }
}
\`\`\`

The string after \`secret:\` is just a key name — descriptive, but with
no global meaning. Pick something stable like \`<service>.<purpose>\`.
Multiple env vars can reference the same key inside one extension; that's
how you keep \`GITHUB_TOKEN\` and \`GH_TOKEN\` in sync from one source.

### Secrets are scoped per extension

Stored secrets are keyed by \`<slug>::<keyName>\`, so two extensions with
different slugs have independent stores. **Don't try to "share" a secret
across extensions — each extension stands on its own.**

This is what makes multi-account setups clean: each account is a separate
extension, with its own \`slug\`, its own guide, and its own credential
under the same friendly key name. Example — a user with both a personal
and a work GitHub:

\`\`\`text
extensions/
  github-personal/
    extension.json     →  "env": { "GITHUB_TOKEN": { "secret": "github.token" } }
    guide.md           →  "Use the gh CLI with the personal account…"
  github-work/
    extension.json     →  "env": { "GITHUB_TOKEN": { "secret": "github.token" } }
    guide.md           →  "Use the gh CLI with the work account…"
\`\`\`

Both files reference \`github.token\` — but the actual encrypted value is
stored at \`github-personal::github.token\` and \`github-work::github.token\`
respectively. Setting one does NOT touch the other.

**When the agent should suggest splitting into multiple extensions:**

- The user has two accounts of the same service and wants to use both
- The same CLI behaves differently per account (different orgs, regions,
  permissions) and the model needs guidance to keep them straight
- Per-account guidance differs (e.g. work account requires \`--team eng\`,
  personal doesn't)

**When one extension is enough:**

- Single account
- Read-only access where account context doesn't matter

If the user has multiple accounts but only mentions one, ask before
collapsing them into a single extension — assuming "one is enough" can
silently lose the second account's setup.

### Setting the secret value

The agent does NOT see plaintext credentials, and SHOULD NOT ask the user
to paste them into the chat. Instead:

1. Write \`extension.json\` with the \`{ secret: "<key>" }\` reference.
2. Tell the user to set the value through the extension's Secrets section
   in the UI (Extensions → \`<extension>\` → Secrets), or via:
   \`window.api.extensions.setSecret(<slug>, <key>, <value>)\`
3. Until the secret is set, the env var simply won't be exported — the
   CLI will fail at runtime and the user will know to set it. That's the
   intended UX, not a bug.

### Non-secrets are fine to inline

Region names, endpoint URLs, default project IDs, feature flags, etc. —
all of those can stay as literal strings. The hard rule applies only to
values that grant access.

## Choosing a variant

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
