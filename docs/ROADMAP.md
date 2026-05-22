# Roadmap

What's in, what's coming, and what's intentionally out of scope.

---

## What's implemented

| Capability                     | Detail                                                                                                                                                                                                                       |
|--------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Anthropic API key**          | Direct API connection — works with any Anthropic-tier account                                                                                                                                                                |
| **Claude Pro/Max OAuth**       | Sign in via PKCE flow; token auto-refresh                                                                                                                                                                                    |
| **GitHub Copilot**             | Device-flow OAuth; live model discovery; mid-session token refresh; Copilot quota display                                                                                                                                    |
| **Built-in agent tools**       | Read, Write, Edit, Bash, Grep, Glob, WebFetch, WebSearch, Task — via `claude_code` SDK preset (Anthropic backend). Pi/Copilot backend has its own equivalent set excluding Task.                                             |
| **Subagents (Anthropic only)** | Task tool available on Anthropic connections — model can spawn subagents within a turn. Not available on Copilot/Pi backend.                                                                                                 |
| **MCP servers**                | stdio + HTTP/SSE transports, consent gate, encrypted secrets — managed through the Extensions panel                                                                                                                          |
| **Extensions**                 | MCP-backed, CLI-bound, and guide-only variants; drop a directory into `<userData>/extensions/`                                                                                                                               |
| **Skills**                     | `SKILL.md` files invoked with `@slug`; global tier under `<userData>/skills/`                                                                                                                                                |
| **@-mention picker**           | Extensions and Skills surfaced as first-class citizens in the mention picker alongside files                                                                                                                                 |
| **Projects**                   | Group sessions by folder with name + color; per-project defaults for connection, model, permission mode; sidebar filter and color dots                                                                                       |
| **Sessions**                   | Full persistence (`messages.jsonl` + `session.json`); resume across restarts; SDK session ID preserved for resumable turns                                                                                                   |
| **Compaction**                 | Persistent inline divider at compaction boundaries with token delta; survives reload                                                                                                                                         |
| **Permission modes**           | Plan (no mutations), Ask (per-tool prompt), Auto (bypass) — per session and global default                                                                                                                                   |
| **Safe bash auto-allow**       | ~55 read-only bash commands auto-allowed in Ask mode; dangerous constructs (`$()`, redirects, `&`, env assignment, `find -exec`) always blocked. Both backends covered.                                                      |
| **Mid-turn steering**          | Inject a message (with attachments) into a live agent turn without cancelling it                                                                                                                                             |
| **Project context**            | Auto-discovers `CLAUDE.md` / `AGENTS.md` / `copilot-instructions.md` recursively; injected into every turn; configurable names                                                                                               |
| **User Preferences**           | Name, timezone, location, language, free-text notes — injected into every system prompt                                                                                                                                      |
| **Encrypted credentials**      | API keys + OAuth tokens via Electron `safeStorage` (OS keychain)                                                                                                                                                             |
| **Thinking / reasoning**       | Extended thinking with collapsible panels                                                                                                                                                                                    |
| **Tool diff UI**               | Inline unified diff + split-view modal for Edit/Write tool calls                                                                                                                                                             |
| **Rich rendering**             | Shiki code blocks, Mermaid diagrams, KaTeX math, JSON tree viewer, fullscreen expand on all blocks                                                                                                                           |
| **Smart snippet attachments**  | Large clipboard pastes auto-converted to named snippet chips; language detection; inline preview                                                                                                                             |
| **Extended context (1M)**      | Opt-in 1M token window for supported models (Anthropic Tier 4+)                                                                                                                                                              |
| **Continue after max turns**   | One-click resume when the agent hits `max_turns`                                                                                                                                                                             |
| **Auto-update**                | `electron-updater` pulling from GitHub Releases                                                                                                                                                                              |
| **SDD workspace panel**        | Native Spec-Driven Development panel: entity cards, phase badges, artifact viewer, constitution viewer, interactive task checkboxes, file-system watchers, lazy rule injection, active feature pinning, phase action buttons |
| **SDD project wizard**         | In-app `specify init` launch when no `.specify/` directory is found                                                                                                                                                          |

---

## What's coming

These are understood, scoped, and on the roadmap — just not shipped yet.

### 🔴 High priority

| What                             | Notes                                                                                                                                                                                                                                                                                                  |
|----------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Hooks / lifecycle automation** | Per-session hooks that fire shell commands on lifecycle events: `on_turn_done`, `on_file_write`, `on_tool_use`. Closes the agent feedback loop automatically — runs tests, typechecks, linting, or `gh pr create` without the user having to ask. MVP: a simple command config per session or project. |
| **Git diff review modal (`Cmd+G`)** | Full-screen modal triggered by `Cmd+G` (zero footprint when not in use). Shows all uncommitted changes via `git status` + `git diff HEAD`: file list on the left, Monaco DiffEditor on the right for syntax-highlighted split-view diff. Closes the review→feedback loop without switching to an IDE. Uses `@monaco-editor/react` for diff quality (syntax highlighting, hunk navigation, word-level highlights). IPC: `git:status` and `git:diff` handlers in `src/main/ipc.ts`. Intentionally a modal not a side panel — it overlays the chat temporarily, `Esc` or `Cmd+G` closes it. |

### 🟡 Medium priority

| What | Notes |
|------|-------|
| **Keyboard shortcut map in Settings** | A "Keyboard Shortcuts" section in the Settings panel listing all available shortcuts. The app currently has very few (`Enter`, `Cmd+Enter`, `Esc`, `Shift+Enter`) — as new shortcuts are added (e.g. `Cmd+G` for git diff), they should be discoverable in one place. Simple static table, no rebinding needed at first. |

### 🟢 Long-term

| What                                  | Notes                                                                                                                                                                                                                                      |
|---------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Built-in browser / visual preview** | Render the user's app, capture screenshots, run E2E checks — all within MA. High value for front-end work; high engineering cost.                                                                                                          |
| **SDD: Task → session queue**         | Parse `tasks.md` checkboxes and offer "Spawn sessions for all tasks" — each unchecked task becomes a child session pre-loaded with `spec.md` + `plan.md` context, checks its box on completion. Depends on parallel session support above. |

---

## What's intentionally out of scope

These are explicit non-goals — they belong to a different product surface or a different strategic lane.

- **Additional LLM providers** (OpenAI direct, Gemini, Bedrock, Ollama) — no current plans; Copilot already proxies a
  range of models for users who need multi-provider access
- **IDE integration / inline completions** — chat-first is the product; the market is moving toward agent-driven
  workflows anyway
- **Codebase semantic indexing** — Claude Code and Codex also don't do this; file tools + large context window is the
  correct approach for this product class
- **Self-hosted server / web UI** — desktop-only by design
- **Cron / scheduled agent runs** — a separate scheduling engine, not a chat app concern
- **Custom rendering blocks** (datatable, html-preview, pdf-preview) — no tool architecture to produce them
- **Theming / multi-language** — system theme only
