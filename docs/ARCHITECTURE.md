# Architecture

Design record for the core agent pipeline. Describes how the main process integrates
the Claude Agent SDK, normalizes events, and wires them to the renderer.

---

## Process boundaries

```
Renderer (React)
    │  window.api (contextBridge)
    ▼
Preload (typed IPC bridge)
    │  ipcMain.handle / ipcRenderer.invoke
    ▼
Main process
    ├─ agent/runner.ts          ← dispatcher (Anthropic vs Pi backend)
    ├─ agent/backends/
    │   ├─ anthropic.ts         ← @anthropic-ai/claude-agent-sdk
    │   └─ pi/agent.ts          ← Pi subprocess (GitHub Copilot / ChatGPT Plus)
    ├─ openai-compatible/      ← remote model discovery + auth for OpenAI-compatible endpoints
    ├─ agent/events.ts          ← SDKMessage → AgentChatEvent adapter
    ├─ agent/options.ts         ← subprocess env, cli.js resolution
    └─ agent/system-prompt.ts   ← system prompt assembly
```

---

## SDK options

`agent/options.ts` builds the `Options` object passed to `query()`:

- `ensureClaudeConfig()` — repairs `~/.claude.json` corruption (BOM, empty
  file, stale `.backup`, `.corrupted.*`) before the subprocess starts.
- `buildClaudeSubprocessEnv(overrides?)` — merges auth env vars on top of
  `process.env`; strips Bedrock routing vars to prevent accidental routing.
- `getDefaultOptions()` — sets `executable: 'node'`, adds `--env-file=/dev/null`
  (defends against Bun's automatic `.env` loading in the SDK subprocess), and
  resolves `pathToClaudeCodeExecutable` to the bundled `cli.js`.

The Anthropic backend assembles:

```ts
const options: Options = {
    ...getDefaultOptions({envOverrides: envForAnthropicAuth(req.auth)}),
    model: effectiveModel,           // may include [1m] suffix when extendedContext
    includePartialMessages: true,
    abortController,
    maxTurns: req.maxTurns ?? DEFAULT_MAX_TURNS,
    permissionMode: toSdkPermissionMode(req.permissionMode),  // 'plan' or 'default'
    tools: {type: 'preset', preset: 'claude_code'},
    mcpServers: buildSdkMcpServers(),
    env: resolveExtensionEnv(),
    systemPrompt: {
        type: 'preset',
        preset: 'claude_code',
        append: buildSystemPromptAppend({cwd: req.cwd}),
    },
    settingSources: ['user', 'project', 'local'],
};
```

---

## Event normalization

`agent/events.ts` maps `SDKMessage` → `AgentChatEvent`:

| SDK message type                                          | → AgentChatEvent                                |
|-----------------------------------------------------------|-------------------------------------------------|
| `stream_event` / `content_block_start` (tool_use)         | `tool_start`                                    |
| `stream_event` / `content_block_delta` (text_delta)       | `text_delta`                                    |
| `stream_event` / `content_block_delta` (input_json_delta) | `tool_input_delta`                              |
| `stream_event` / `content_block_delta` (thinking_delta)   | `thinking_delta`                                |
| `assistant` (text block, no prior delta)                  | `text_complete`                                 |
| `user` (tool_result blocks)                               | `tool_result`                                   |
| `result` (success)                                        | `turn_done` with session_id, stop_reason, usage |
| `result` (non-success subtype)                            | `error`                                         |

Events are forwarded over IPC as `{ id: turnId, ...event }` so the renderer
correlates them by turn id.

---

## Pi backend (GitHub Copilot / ChatGPT Plus / OpenAI-compatible)

`agent/backends/pi/agent.ts` spawns a Node subprocess running
`@earendil-works/pi-coding-agent`. Communication is over stdin/stdout as
newline-delimited JSON (`SubprocessInbound` / `SubprocessOutbound` in
`protocol.ts`).

Lifecycle:

1. `init` message — session id, working directory, model, auth, permission mode ('plan' or 'auto'), system prompt
2. `prompt` messages — user turns
3. Subprocess emits `event` messages (pre-adapted to `AgentChatEvent`)
4. `auth_required` from subprocess → main refreshes the Copilot or ChatGPT token and
   pushes a `token_update` back in
5. `set_model` / `set_thinking_level` / `set_permission_mode` — live updates
   without restarting the subprocess
6. Sessions persist under `<sessionPath>/.pi-sessions/` and are resumed via
   `resumePiSessionId`

For **OpenAI-compatible providers** (StepFun, DeepSeek, Moonshot, Together AI,
Groq, OpenRouter, xAI, custom), model discovery hits the provider's `/v1/models`
endpoint from the main process (no CORS), and authentication uses a Bearer API key
resolved via `auth/resolve.ts` into `LocalApiAuth` (baseUrl + optional key).
See [OPENAI-COMPATIBLE.md](OPENAI-COMPATIBLE.md) for the full reference.

---

## System prompt

`agent/system-prompt.ts` assembles the dynamic context block appended to
every turn's user message:

- Working directory path and context label
- Current date/time (authoritative for the agent)
- Discovered project context files (`CLAUDE.md` / `AGENTS.md`) listed for
  the model to read
- User preferences (`formatPreferencesForPrompt()`)
- Skill directives (from `@mention` resolution)
- Extension awareness block (installed extensions + guide paths)

Project context files are discovered recursively up to a configurable depth,
with a per-directory TTL cache invalidated on file-system events.

---

## Credentials & auth

- API keys and OAuth tokens are stored encrypted via Electron `safeStorage`
  under `<userData>/credentials.enc`.
- `auth/resolve.ts` is called at the start of every turn; it refreshes
  expiring tokens (5-minute buffer) and serialises concurrent refreshes
  for the same connection with a per-slug mutex.
- Claude OAuth tokens are refreshed with `claude-flow.ts:refreshToken()`.
- Copilot tokens are refreshed with `copilot-flow.ts` using the stored
  long-lived GitHub OAuth token.

---

## Extensions & MCP

`extensions/` manages installable capability packs. Three variant types:

- **MCP-backed** — spawns an MCP server (stdio or HTTP/SSE) and exposes its
  tools as `mcp__<slug>__<tool>` on **both backends**. The Anthropic backend
  wires them into `Options.mcpServers` via `buildSdkMcpServers(cwd?)`; the Pi
  backend resolves serializable configs with `buildResolvedMcpServers(cwd?)`.
- **CLI-bound** — injects env vars into the SDK subprocess via
  `resolveExtensionEnv(cwd?)`, enabling bundled CLI tools.
- **Guide-only** — provides a `guide.md` referenced in the per-turn awareness block.

All three types support two tiers (same priority rules as skills/agents):

| Tier | Path | Notes |
|------|------|-------|
| User | `~/.minimalist-agent/extensions/<slug>/` | `enabled` flag respected; MCP requires consent + keychain secrets |
| Project | `<cwd>/.minimalist-agent/extensions/<slug>/` | Always active (presence = enabled); MCP auto-consented; env refs resolved from `process.env` |

All extension-loading functions accept an optional `cwd` parameter and merge
both tiers. The `ExtensionRegistry` is user-tier only (Settings panel); project-tier
is loaded dynamically per session turn.

For user-tier MCP: consent required before connecting; secrets stored in OS keychain;
decrypted in main process before crossing into Pi subprocess via `MsgInit`.

---

## Skills

`skills/` resolves `@slug` mentions in user messages:

1. `mentions.ts` — scans the message for `@token` mentions. Two token forms are supported:
    - Plain: `@src/utils.ts` — word chars, dots, slashes, hyphens
    - Quoted: `` @`My Document.txt` `` — backtick-delimited, used when a path contains spaces
2. `storage.ts` — locates the skill across two tiers (project-local first, then user-global).
3. `directive.ts` — formats the "read these files first" directive injected before the user message.

Skills are resolved from two tiers in priority order:

| Tier    | Location                                         | Scope                               |
|---------|--------------------------------------------------|-------------------------------------|
| Project | `<cwd>/.minimalist-agent/skills/<slug>/SKILL.md` | This project only — git-committable |
| User    | `~/.minimalist-agent/skills/<slug>/SKILL.md`     | All projects — dotfile-syncable     |

When the same slug exists in both tiers, the project tier wins.

---

## Storage layout

Three storage tiers. Priority (highest wins): **project > user > machine**.

```
<userData>/                     ← machine-specific, Electron-managed
  settings.json                 ← AI defaults (model, thinking, maxTurns, permission mode, autonomy level)
  preferences.json              ← User preferences (name, timezone, location, notes)
  connections.json              ← Connection metadata (slugs, models, auth types)
  credentials.enc               ← Encrypted API keys + OAuth tokens
  extension-secrets.enc         ← Per-extension encrypted secrets
  extension-consents.json       ← MCP consent state
  logs/
  claude-config/                ← Sandboxed CLAUDE_CONFIG_DIR for SDK binary
  sessions/
    <id>/
      session.json              ← Metadata (title, model, timestamps, pinnedAssets, ...)
      messages.jsonl            ← Message + parts log (append-only)
      attachments/
      .pi-sessions/             ← Pi subprocess session state (Copilot backend)

~/.minimalist-agent/            ← user-owned portable config (versionable, dotfile-syncable)
  agents/
    <slug>/
      AGENT.md
  skills/
    <slug>/
      SKILL.md
  extensions/
    <slug>/
      extension.json
      guide.md

<cwd>/.minimalist-agent/        ← project-local config (git-committable, team-shareable)
  agents/
    <slug>/
      AGENT.md
  skills/
    <slug>/
      SKILL.md
  extensions/
    <slug>/
      extension.json    ← type + command/env; no enabled field (presence = active)
      guide.md
  worktrees/                    ← auto-gitignored (worktree isolation)
```

**Migration:** On first launch, `storage/migrate-user-config.ts` copies
`<userData>/agents|skills|extensions` → `~/.minimalist-agent/` (idempotent,
guarded by a marker file, only written on full success).

---

## File Explorer

Collapsible file tree panel (Cmd+B) for browsing project structure. Read-only, gitignore-aware.

**IPC:** `files:listDirectory`, `files:buildFileTree` (`src/main/files/list-directory.ts`)

**State:**

- Panel open/closed + width: `useResizablePanels('explorer-v2')` (localStorage)
- Expanded paths: `session.json → SessionMetadata.fileExplorer.expandedPaths` (per-session)

**Performance:** Virtual scrolling via `@tanstack/react-virtual` (activates at >200 items)

See [FILE_EXPLORER.md](./FILE_EXPLORER.md) for full documentation.

---

## Context Panel

Collapsible side panel (`Cmd+Shift+B`) showing what's available and pinned for the active session.

**Mutual exclusion:** only one side panel (File Explorer or Context Panel) open at a time. Both share a single
`ResizablePanel` slot — `activeSidePanel: 'explorer' | 'context' | null` controls which content renders inside.

**Sections:**

| Section             | Content                                                       | Action      |
|---------------------|---------------------------------------------------------------|-------------|
| Active this session | Pinned skills + agents                                        | Unpin       |
| `<project-name>`    | Project-local skills + agents from `<cwd>/.minimalist-agent/` | Pin / Unpin |
| Global              | User-tier skills + agents from `~/.minimalist-agent/`         | Pin / Unpin |
| Extensions          | All enabled extensions (read-only)                            | —           |

**Pin mechanic:** Pinning adds the item's name + description to the per-turn
`<pinned_context>` block in the system prompt — a lightweight awareness note
(~15 tokens per item) so the model knows the resource exists and can apply it
when relevant. Not full-content injection. Pinned state persists in
`session.json → pinnedAssets: string[]` (format: `'user:slug'` or `'project:slug'`).

**Discovery card:** When a new session's CWD contains `.minimalist-agent/` assets,
a one-time dismissible card appears at the top of the chat, linking to the panel.

**IPC handlers:** `context:listAvailable`, `context:pin`, `context:unpin`,
`context:estimateTokens`, `context:hasProjectAssets` (`src/main/ipc.ts`).
