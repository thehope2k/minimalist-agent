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
    ├─ agent/claude.ts          ← dispatcher (Anthropic vs Pi backend)
    ├─ agent/backends/
    │   ├─ anthropic.ts         ← @anthropic-ai/claude-agent-sdk
    │   └─ pi/agent.ts          ← Pi subprocess (GitHub Copilot)
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

## Pi backend (GitHub Copilot)

`agent/backends/pi/agent.ts` spawns a Node subprocess running
`@earendil-works/pi-coding-agent`. Communication is over stdin/stdout as
newline-delimited JSON (`SubprocessInbound` / `SubprocessOutbound` in
`protocol.ts`).

Lifecycle:

1. `init` message — session id, working directory, model, auth, permission mode ('plan' or 'auto'), system prompt
2. `prompt` messages — user turns
3. Subprocess emits `event` messages (pre-adapted to `AgentChatEvent`)
4. `auth_required` from subprocess → main refreshes the Copilot token and
   pushes a `token_update` back in
5. `set_model` / `set_thinking_level` / `set_permission_mode` — live updates
   without restarting the subprocess
6. Sessions persist under `<sessionPath>/.pi-sessions/` and are resumed via
   `resumePiSessionId`

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

`extensions/` manages installable capability packs:

- **MCP-backed** — spawns an MCP server (stdio or HTTP/SSE) and wires it
  into `Options.mcpServers` via `buildSdkMcpServers()`.
- **CLI-bound** — injects env vars into the SDK subprocess via
  `resolveExtensionEnv()`, enabling bundled CLI tools.
- **Guide-only** — provides a `guide.md` injected into the system prompt.

Consent is required before any MCP server is connected; secrets are stored
per-extension in the OS keychain.

---

## Skills

`skills/` resolves `@slug` mentions in user messages:

1. `mentions.ts` — scans the message for `@slug` tokens.
2. `storage.ts` — locates `<userData>/skills/<slug>/SKILL.md`.
3. `directive.ts` — formats the "read these files first" directive injected
   before the user message.

Skills live in a single global tier (`<userData>/skills/`) matching the pi
agent harness convention.

---

## Storage layout

```
<userData>/
  settings.json          ← AI defaults (model, thinking, maxTurns, permission mode, autonomy level)
  preferences.json       ← User preferences (name, timezone, location, notes)
  connections.json       ← Connection metadata (slugs, models, auth types)
  credentials.enc        ← Encrypted API keys + OAuth tokens
  extensions/            ← Installed extensions (extension.json + guide.md)
  skills/                ← Installed skills (<slug>/SKILL.md)
  sessions/
    <id>/
      session.json       ← Metadata (title, model, timestamps, sdkSessionId, fileExplorer state)
      messages.jsonl     ← Message + parts log (append-only)
      attachments/       ← Stored file attachments
      .pi-sessions/      ← Pi subprocess session state (Copilot backend)
```

---

## File Explorer

Collapsible file tree panel (Cmd+B) for browsing project structure. Read-only, gitignore-aware.

**IPC:** `files:listDirectory`, `files:buildFileTree` (`src/main/files/list-directory.ts`)

**State:**
- Panel open/closed + width: `useResizablePanels('explorer-v1')` (localStorage)
- Expanded paths: `session.json → SessionMetadata.fileExplorer.expandedPaths` (per-session)

**Performance:** Virtual scrolling via `@tanstack/react-virtual` (activates at >200 items)

See [FILE_EXPLORER.md](./FILE_EXPLORER.md) for full documentation.
