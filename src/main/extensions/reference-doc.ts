/**
 * Bundled reference doc for Extensions. Materialized to
 * `<userData>/docs/extensions.md` on app boot. Bump the version when the
 * content changes; the install pass overwrites stale copies.
 */

export const EXTENSIONS_REFERENCE_VERSION = '0.3.0';

export const EXTENSIONS_REFERENCE_MD = `# Extensions

Every extension is a guide the agent reads before using it. Two capabilities
are optional and independent — an extension can have neither, either, or
both. There's no "variant" to pick; \`extension.json\`'s shape tells you what
it has:

| Capability | Adds | extension.json shape |
|---|---|---|
| _(none)_ | Prose that nudges the agent's behavior — that's the baseline every extension has | no \`env\`, no \`mcp\` |
| CLI env | Credentials/config exported into every Bash call | \`env\` block |
| MCP server | A running server exposing structured tools | \`mcp\` block |

An extension with neither capability is just a guide (an internal SOP, a
coding-style note, a CLI that's already configured elsewhere). One with
\`env\` also wires credentials into Bash. One with \`mcp\` also spawns/connects
a server whose tools appear as \`mcp__<slug>__<tool>\`. A real-world extension
can have \`env\` **and** \`mcp\` at once (e.g. an MCP server that needs an API
key — use \`envFromBinding: true\` so the key reaches the server process without
also polluting the global Bash env).

## Folder layout

Extensions live in two scopes:
- **Global:** \`~/.minimalist-agent/extensions/<slug>/\` — personal, available across all projects
- **Project:** \`<cwd>/.minimalist-agent/extensions/<slug>/\` — always active and auto-consented; env vars use \`\${VAR}\` syntax resolved from \`process.env\` (not the encrypted keychain)

Each extension folder requires two files:

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
  "version": "0.1.0",
  "icon": "🟣",                               // optional
  "tags": ["pm", "issues"],

  // env values (only needed if this extension requires credentials/config
  // in Bash): literal OR a SecretRef.
  // ⚠ Credentials (API keys, tokens, passwords) MUST be SecretRefs — never
  // literal strings. See "Secrets" below.
  "env": {
    "LINEAR_API_KEY": { "secret": "linear.apiKey" }
  },

  // only needed if this extension runs an MCP server:
  "mcp": {
    "transport": "stdio",
    "command": "npx",
    "args": ["-y", "@linear/mcp-server"],
    "envFromBinding": true
  },

  // optional. Only \`blockedTools\` is currently enforced (MCP-backed
  // extensions only) — \`writeAccess\`/\`networkHosts\`/\`commandPrefixes\` are
  // reserved for future enforcement; setting them today has no runtime
  // effect, so don't tell a user they restrict anything yet.
  "permissions": {
    "blockedTools": ["delete_issue", "archive_project"],
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

## Capabilities in detail

### Guide only

No \`env\`, no \`mcp\`. The agent uses existing built-in tools (Bash / Read)
following your guide. Best fit when no credentials are needed and the agent
only needs prose nudging — an internal SOP, a "how we use git" reference, a
coding-style note, or a CLI that's already configured outside the app.

### + CLI env

\`env\` block declares variables that get exported into Bash invocations.
Add this when there's a well-maintained CLI for the service and calling it
from Bash is straightforward — \`gh\`, \`aws\`, \`vercel\`, \`kubectl\`,
etc. Read **Secrets** below before populating \`env\`. Any \`SecretRef\` in
\`env\` requires the user's one-time approval before it's exported — but
unlike an MCP server, it's automatic: saving the secret's value **is** the
approval (see **Consent**).

### + MCP server

\`mcp\` block configures a Model Context Protocol server. Stdio servers are
spawned as subprocesses; HTTP/SSE servers are connected over the network.
Tools exposed by the server appear to the agent as \`mcp__<slug>__<toolname>\`.
Add this when the service ships an official MCP server, or has no good CLI
and you'd benefit from typed tool calls — Linear, Notion, etc. Always
requires the user's one-time approval before it can be spawned/connected.

To restrict which of the server's tools the agent may call, set
\`permissions.blockedTools\` to the bare tool names (no \`mcp__<slug>__\`
prefix) that should never be called — e.g. destructive ones. Everything not
listed stays callable; omit the field entirely to allow every tool the
server exposes. Enforcement happens in the agent runtime.

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

The JSON file lives plaintext on disk under \`~/.minimalist-agent/extensions/<slug>/\`
(global tier) or \`<cwd>/.minimalist-agent/extensions/<slug>/\` (project tier).
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
2. Tell the user to set the value on the extension's info page
   (Extensions → \`<extension>\` → Keys & access), or via:
   \`window.api.extensions.setSecret(<slug>, <key>, <value>)\`
3. Until the secret is set, the env var simply won't be exported — the
   CLI will fail at runtime and the user will know to set it. That's the
   intended UX, not a bug.

### Non-secrets are fine to inline

Region names, endpoint URLs, default project IDs, feature flags, etc. —
all of those can stay as literal strings. The hard rule applies only to
values that grant access.

## Choosing capabilities

Don't default to "simpler is better" — a real MCP server gives the agent
typed tools, which is often a better experience than parsing CLI output.
Conversely, wrapping a great CLI in MCP is unnecessary overhead. These are
two independent yes/no questions, not a single three-way pick:

1. **Does this need a credential?** If the service requires an API key/token
   to call, add \`env\` with a \`SecretRef\`. If not, skip \`env\` entirely.
2. **Does this need a running server?** If there's a real MCP server for the
   service, or no good CLI and you want typed tool calls, add \`mcp\`. If a
   CLI (or no tooling at all) is the better fit, skip \`mcp\`.

When the answer to either question is genuinely unclear or the trade-off is
non-trivial (e.g. an official MCP server exists *and* the CLI works fine),
the agent should ask the user rather than default.

> **MCP servers.** They are spawned on demand by the agent subprocess and their
> tools reach the agent as \`mcp__<slug>__<tool>\`. A server that fails to
> start (or exceeds the connect budget) is skipped without blocking the
> session; its tools are simply absent that run. Required secrets and user
> consent are enforced the same way regardless of connection type.

## Consent

Any extension that either (a) declares \`mcp\`, or (b) declares a \`SecretRef\`
in \`env\`, requires one-time user approval before it can act —
spawning/connecting the MCP server, or exporting the credential into Bash.

- **MCP:** approval is a dedicated step in the Extensions panel (\`<extension>\`
  → Keys & access → Allow) — spawning a server neither the user nor the
  agent-drafted config has necessarily been reviewed line-by-line deserves an
  explicit beat.
- **Credential-only (no \`mcp\`):** approval happens automatically the moment
  the user saves the secret's value — typing a real credential into a field
  scoped to that exact extension and env var name already is the deliberate
  act; a second click adds friction without adding a distinct decision.

Either way, approval is scoped to what was approved: changing the MCP
command/URL, or which env vars carry secrets, invalidates a prior approval
and requires a fresh one. Extensions with neither capability (guide only, or
+ CLI env with only literal/non-secret values) need no approval.
Project-tier extensions are always auto-approved (presence in
\`.minimalist-agent/\` already is the approval).

## Creating extensions in chat

Click "+ New Extension" or ask the agent: "connect Linear" / "add an aws-iac
extension". The agent will research the integration, draft \`extension.json\`
and \`guide.md\`, write them to disk, and verify they work.
`;
