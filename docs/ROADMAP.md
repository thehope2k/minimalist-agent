# Roadmap

What's shipped, what's coming, and what's intentionally out of scope.

---

## Shipped

### AI Connections

| Capability | Detail |
|---|---|
| **Anthropic API key** | Direct `sk-ant-` API key; models: Opus 4.7 (1M ctx), Sonnet 4.6 (200K), Haiku 4.5 (200K). Stored encrypted via OS keychain |
| **Claude Pro / Max OAuth** | Browser PKCE flow via `claude.ai`; user pastes auth code back; same Anthropic model set; token auto-refresh |
| **GitHub Copilot** | Device-flow OAuth at `github.com/login/device`; live model discovery from Copilot `/models` endpoint (tier-filtered — includes Claude Sonnet/Haiku, GPT-5, GPT-5.1, and more); mid-session token refresh; Copilot quota display; runs on Pi runtime |
| **ChatGPT Plus / Codex** | Browser OAuth via `auth.openai.com` (auto-redirect back, no code to copy); live model discovery via Pi SDK `openai-codex` catalog; runs on Pi runtime with full permission modes and tool streaming |
| **Local model (Ollama)** | Connects to `http://localhost:11434` (configurable for remote hosts); live model discovery via Ollama `/api/tags` with probe/retry UI; model list shows name + size; no auth required |
| **Extended context (1M)** | Opt-in 1M-token window for supported models (Anthropic Tier 4+) |
| **Encrypted credentials** | API keys and OAuth tokens stored via Electron `safeStorage` (OS keychain) |

---

### Agent Runtime

| Capability | Detail |
|---|---|
| **Built-in tools** | Read, Write, Edit, Bash, Grep, Glob, WebFetch, WebSearch, Task — via `claude_code` SDK preset (Anthropic). Pi/Copilot backend has its own equivalent set excluding Task |
| **Subagents** | Agent/Task delegation available on both Anthropic and Pi backends, including parallel-safe spawning on Pi |
| **Permission modes** | Plan (no mutations), Ask (per-tool prompt), Auto (bypass) — per-session and global default |
| **Safe bash auto-allow** | ~55 read-only bash commands auto-allowed in Ask mode. Dangerous constructs (`$()`, redirects, `&`, env assignment, `find -exec`) always blocked. Both backends covered |
| **Mid-turn steering** | Inject a message (with attachments) into a live agent turn without cancelling it |
| **Continue after max turns** | One-click resume when the agent hits `max_turns` |
| **Thinking / reasoning** | Extended thinking with collapsible panels |
| **Compaction** | Persistent inline divider at compaction boundaries with token delta; survives reload |
| **Agent Definitions (AGENT.md system)** | Implemented end-to-end: global AGENT.md storage, Agents tab management UI, Build with AI flow, system-prompt discovery, Pi custom Agent tool, and nested sub-agent visibility in chat |

---

### Sessions & Projects

| Capability | Detail |
|---|---|
| **Sessions** | Full persistence (`messages.jsonl` + `session.json`); resume across restarts; SDK session ID preserved for resumable turns |
| **Projects** | Group sessions by folder with name + color; per-project defaults for connection, model, permission mode; sidebar filter and color dots |
| **User Preferences** | Name, timezone, location, language, free-text notes — injected into every system prompt |
| **Project context** | Auto-discovers `CLAUDE.md` / `AGENTS.md` / `copilot-instructions.md` recursively; injected into every turn; configurable names |

---

### Extensions & Skills

| Capability | Detail |
|---|---|
| **Extensions** | MCP-backed, CLI-bound, and guide-only variants; drop a directory into `<userData>/extensions/` |
| **MCP servers** | stdio + HTTP/SSE transports, consent gate, encrypted secrets — managed through the Extensions panel |
| **Skills** | `SKILL.md` files invoked with `@slug`; global tier under `<userData>/skills/` |
| **@-mention picker** | Extensions and Skills surfaced as first-class citizens in the mention picker alongside files |

---

### Developer Tools

| Capability | Detail |
|---|---|
| **Terminal (Cmd+T)** | Full persistent terminal panel (`xterm.js` + `node-pty`). Real PTY — interactive processes work correctly. Multiple tabs with `Cmd+←/→` switching, `Cmd+Shift+T` new tab, `Cmd+Shift+W` close. Resizable with `Cmd+Shift+↑/↓` (3% steps). Panel toggle survives close/reopen — PTY and scrollback (2 MB ring buffer) persist in main process. CWD seeded from active session on first open. **Cmd+K** clear, **Cmd+F** in-terminal search (xterm `SearchAddon`, live highlight), copy-on-select, right-click context menu (Copy/Paste/Clear), URL Cmd+Click opens in system browser. Three fonts bundled (JetBrains Mono default, Fira Code, Cascadia Code) plus system fonts. Settings: shell file picker, font family/size dropdowns, scrollback preset |
| **Git diff review (Cmd+G)** | Full-screen modal. Pure `git status` + `git diff HEAD` showing uncommitted changes. Left panel: file list grouped by git root with `M`/`N`/`D`/`R` color-coded status, `↑↓` keyboard nav. Right panel: Monaco DiffEditor, split/unified toggle, VS Code Dark+ theme, auto-scroll to first hunk. Multi-repo workspace support |
| **Git commit flow** | Extends Cmd+G modal. File-level checkboxes + hunk-level staging via Monaco glyph margin icons. Partial-hunk commits use `git hash-object + update-index` so the disk file is never touched. Commit panel: 6-row textarea, `Cmd+Enter` submit, amend checkbox (pre-fills last message, restores on uncheck, amber UI), multi-repo footer |
| **SDD workspace panel** | Native Spec-Driven Development panel: entity cards, phase badges, artifact viewer, constitution viewer, interactive task checkboxes, file-system watchers, lazy rule injection, active feature pinning, phase action buttons |
| **SDD project wizard** | In-app `specify init` launch when no `.specify/` directory is found |
| **Tool diff UI** | Inline unified diff + split-view modal for Edit/Write tool calls |

---

### Search & Navigation

| Capability | Detail |
|---|---|
| **Search Everything (Double Shift)** | Double-tap Shift (<300 ms) opens a unified search palette — mirrors IntelliJ's "Search Everywhere". Two progressive sections: **Files** (fuzzy filename search, instant, `files:search` IPC + client-side scoring) and **In files** (full-text grep via bundled `@vscode/ripgrep`, debounced 250 ms, `asarUnpack` so binary runs from disk). Results open a smart file viewer: Markdown renders with full chat renderer (remark-gfm, KaTeX, Shiki, Mermaid, JSON tree) plus Source toggle; images open in ZoomPan canvas (scroll-to-zoom, drag-to-pan); JSON/JSONC shows interactive `@uiw/react-json-view` tree; all other files open in read-only Monaco that jumps to the matched line |
| **Recent Files (Cmd+E)** | Palette of the 30 most recently opened files, most-recent first, persisted in `localStorage`. Type to narrow by filename or path; arrow keys navigate; Enter opens. Same `mouseMovedRef` guard as Search Everywhere so Enter always opens the keyboard-highlighted row. Clear button wipes the list. Opening any file from Search Everywhere or Recent Files records it in history |
| **Keyboard shortcut map** | Settings → Shortcuts panel listing all shortcuts with styled key chips (`⌘`/`⇧`/`↵` symbols, `+` connectors, physical-key shadow) |

---

### UI & Rendering

| Capability | Detail |
|---|---|
| **Rich rendering** | Shiki code blocks, Mermaid diagrams, KaTeX math, JSON tree viewer, fullscreen expand on all blocks |
| **Smart snippet attachments** | Large clipboard pastes auto-converted to named snippet chips; language detection; inline preview |
| **Tooltips** | Radix `@radix-ui/react-tooltip` across all `IconButton` usages app-wide; 400 ms delay, consistent styling, `TooltipProvider` at root |
| **Auto-update** | `electron-updater` pulling from GitHub Releases |

---

## Coming soon

### 🔴 High priority

| What | Notes |
|---|---|
| **Hooks / lifecycle automation** | Per-session hooks that fire shell commands on lifecycle events: `on_turn_done`, `on_file_write`, `on_tool_use`. Closes the agent feedback loop — runs tests, typechecks, linting, or `gh pr create` without the user having to ask. MVP: simple command config per session or project |

---

### 🟡 Medium priority

| What | Notes                                             |
|---|---------------------------------------------------|
| **Mode Architecture: Built-in Agents + Plan/Task UI** | Details in docs/intelligent-automation-system.md. |

---

### 🟢 Long-term

| What | Notes |
|---|---|
| **Built-in browser / visual preview** | Render the user's app, capture screenshots, run E2E checks — all within MA. High value for front-end work; high engineering cost |
| **SDD: Task → session queue** | Parse `tasks.md` checkboxes and offer "Spawn sessions for all tasks" — each unchecked task becomes a child session pre-loaded with `spec.md` + `plan.md` context, checks its box on completion |

---

## Out of scope

Explicit non-goals — they belong to a different product surface or a different strategic lane.

| What | Why |
|---|---|
| **Additional LLM providers** (Gemini, Bedrock) | No current plans; Copilot and ChatGPT Plus connections already cover the major OpenAI models; Ollama covers local inference |
| **IDE integration / inline completions** | Chat-first is the product; the market is moving toward agent-driven workflows |
| **Codebase semantic indexing** | Claude Code and Codex don't do this either; file tools + large context window is the right approach for this product class |
| **Self-hosted server / web UI** | Desktop-only by design |
| **Cron / scheduled agent runs** | A separate scheduling engine — not a chat app concern |
| **Custom rendering blocks** (datatable, html-preview, pdf-preview) | No tool architecture to produce them |
| **Theming / multi-language** | System theme only |
