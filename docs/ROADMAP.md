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
| **OpenAI-compatible providers** | Curated presets for StepFun, DeepSeek, Moonshot, Together AI, Groq, OpenRouter, xAI plus a custom endpoint escape hatch; live model discovery via `/v1/models`; encrypted API key storage |
| **Session export & sharing** | Export sessions to HTML (summary or full); save to disk via native dialog or publish ephemeral share links with configurable TTL; revoke links; automatic redaction of paths and secrets on share. Per-response **Copy / Save / Share** actions in the message footer: Copy writes both `text/html` + `text/plain` so pasting into Teams/Slack/Notion renders with formatting. |
| **Extended context (1M)** | Opt-in 1M-token window for supported models (Anthropic Tier 4+) |
| **Encrypted credentials** | API keys and OAuth tokens stored via Electron `safeStorage` (OS keychain) |

---

### Agent Runtime

| Capability | Detail |
|---|---|
| **Built-in tools** | Read, Write, Edit, Bash, Grep, Glob, WebFetch, WebSearch, Task — via `claude_code` SDK preset (Anthropic). Pi/Copilot backend has its own equivalent set excluding Task |
| **Subagents** | Agent/Task delegation available on both Anthropic and Pi backends, including parallel-safe spawning on Pi |
| **Permission modes** | Plan (read-only exploration) · Auto (intelligent execution with 0-100% autonomy slider) — per-session and global default |
| **Intelligent collaboration** | Auto mode includes autonomy slider (0-100%) controlling how often the agent engages the user for decisions, approvals, preferences, feedback, and guidance. Higher autonomy = more independence; lower autonomy = more collaboration. See [COLLABORATION.md](COLLABORATION.md) |
| **Planning workflow** | Intelligent multi-phase execution for complex tasks. Agent creates structured plans with safety-classified phases, real-time progress tracking, dynamic revision, and human-in-the-loop controls. Plan mode auto-executes safe phases; Auto mode uses autonomy for approvals. Full UI with progress widget, approval dialogs, error recovery. |
| **Mid-turn steering** | Inject a message (with attachments) into a live agent turn without cancelling it |
| **Continue after max turns** | One-click resume when the agent hits `max_turns` |
| **Thinking / reasoning** | Extended thinking with collapsible panels |
| **Compaction** | Persistent inline divider at compaction boundaries with token delta; survives reload |
| **Agent Definitions (AGENT.md system)** | Implemented end-to-end: user-tier AGENT.md storage (`~/.minimalist-agent/agents/`), project-tier (`<cwd>/.minimalist-agent/agents/`), Agents tab management UI, Build with AI flow, system-prompt discovery, Pi custom Agent tool, and nested sub-agent visibility in chat |

---

### Sessions & Projects

| Capability | Detail |
|---|---|
| **Sessions** | Full persistence (`messages.jsonl` + `session.json`); resume across restarts; SDK session ID preserved for resumable turns; HTML export (summary/full) with local save or ephemeral share links (TTL, revoke, redaction) |
| **Projects** | Group sessions by folder with name + color; per-project defaults for connection, model, permission mode; sidebar filter and color dots |
| **User Preferences** | Name, timezone, location, language, free-text notes — injected into every system prompt |
| **Project context** | Auto-discovers `CLAUDE.md` / `AGENTS.md` / `copilot-instructions.md` recursively; injected into every turn; configurable names |

---

### Extensions & Skills

| Capability | Detail |
|---|---|
| **Extensions** | MCP-backed, CLI-bound, and guide-only variants. Two tiers: user-global (`~/.minimalist-agent/extensions/`) and project-local (`<cwd>/.minimalist-agent/extensions/`). Project-tier extensions are auto-active (presence = enabled, no consent gate for MCP). Env var refs (`${VAR}`) resolved from environment for project-tier. |
| **MCP servers** | stdio + HTTP/SSE transports. User-tier: consent gate + encrypted secrets. Project-tier: auto-consented, `${VAR}` env refs from process.env. Managed through Extensions panel (user-tier) or `.minimalist-agent/extensions/` (project-tier). |
| **Skills** | `SKILL.md` files invoked with `@slug`; two tiers: user-global (`~/.minimalist-agent/skills/`) and project-local (`<cwd>/.minimalist-agent/skills/`). Project tier takes precedence for same slug. |
| **@-mention picker** | Skills, extensions, and files surfaced in the picker. Project-local skills and extensions show `· project` badge. |
| **Project-local agents & skills** | Three-tier storage (machine / user / project). User tier at `~/.minimalist-agent/` is versionable and dotfile-syncable. Project tier at `<cwd>/.minimalist-agent/` is git-committable and team-shareable. One-time migration from `userData` on first launch. |
| **Context Panel (`Cmd+Shift+B`)** | Session-scoped side panel showing available skills, agents, extensions. Pin any item to keep it in the model's per-turn awareness. Mutual exclusion with File Explorer — one side panel open at a time. Includes new-session discovery card when project-local assets exist. |

---

### Developer Tools

| Capability | Detail |
|---|---|
| **Terminal (Cmd+T)** | Full persistent terminal panel (`xterm.js` + `node-pty`). Real PTY — interactive processes work correctly. Multiple tabs with `Cmd+←/→` switching, `Cmd+Shift+T` new tab, `Cmd+Shift+W` close. Resizable with `Cmd+Shift+↑/↓` (3% steps). Panel toggle survives close/reopen — PTY and scrollback (2 MB ring buffer) persist in main process. CWD seeded from active session on first open. **Cmd+K** clear, **Cmd+F** in-terminal search (xterm `SearchAddon`, live highlight), copy-on-select, right-click context menu (Copy/Paste/Clear), URL Cmd+Click opens in system browser. Three fonts bundled (JetBrains Mono default, Fira Code, Cascadia Code) plus system fonts. Settings: shell file picker, font family/size dropdowns, scrollback preset |
| **File Explorer (Cmd+B)** | Collapsible file tree panel for browsing project structure without launching an IDE. Right sidebar with gitignore filtering (hides node_modules, .git, build artifacts). Virtual scrolling for >200 items via `@tanstack/react-virtual`. Keyboard navigation (↑↓→←Enter), inline filter (auto-focused on open), context menu (Copy Path, Reveal in Finder). Read-only by design — no file management. Expanded folder paths persist per session. Proportions: Chat 72% (closed) → ~50% (open), Explorer ~28% (adjustable 15-40%). See [FILE_EXPLORER.md](FILE_EXPLORER.md) |
| **Git diff review (Cmd+G)** | Full-screen modal. Pure `git status` + `git diff HEAD` showing uncommitted changes. Left panel: file list grouped by git root with `M`/`N`/`D`/`R` color-coded status, `↑↓` keyboard nav. Right panel: Monaco DiffEditor, split/unified toggle, VS Code Dark+ theme, auto-scroll to first hunk. Multi-repo workspace support |
| **Git commit flow** | Extends Cmd+G modal. File-level checkboxes + hunk-level staging via Monaco glyph margin icons. Partial-hunk commits use `git hash-object + update-index` so the disk file is never touched. Commit panel: 6-row textarea, `Cmd+Enter` submit, amend checkbox (pre-fills last message, restores on uncheck, amber UI), multi-repo footer |
| **SDD workspace panel** | Native Spec-Driven Development panel: entity cards, phase badges, artifact viewer, constitution viewer, interactive task checkboxes, file-system watchers, lazy rule injection, active feature pinning, phase action buttons |
| **SDD project wizard** | In-app `specify init` launch when no `.specify/` directory is found |
| **Tool diff UI** | Inline unified diff + split-view modal for Edit/Write tool calls |
| **OpenTelemetry tracing** | Opt-in spans (off by default) for agent turns, model requests, and tool calls, following the GenAI semantic conventions (`invoke_agent`/`chat`/`execute_tool`). Cache-aware token accounting, time-to-first-token, file (JSONL)/OTLP/console exporters, and `OTEL_RESOURCE_ATTRIBUTES` (`user.name`/`team.id`) for per-user token telemetry. Metadata-only unless content capture is enabled; secrets never recorded. Settings → Telemetry. See [OTEL.md](OTEL.md) |

---

### Search & Navigation

| Capability | Detail |
|---|---|
| **Search Everything (Double Shift)** | Double-tap Shift (<300 ms) opens a unified search palette — mirrors IntelliJ's "Search Everywhere". Two progressive sections: **Files** (fuzzy filename search, instant, `files:search` IPC + client-side scoring) and **In files** (full-text grep via bundled `@vscode/ripgrep`, debounced 250 ms, `asarUnpack` so binary runs from disk). Results open a smart file viewer: Markdown renders with full chat renderer (remark-gfm, KaTeX, Shiki, Mermaid, JSON tree) plus Source toggle; images open in ZoomPan canvas (scroll-to-zoom, drag-to-pan); JSON/JSONC shows interactive `@uiw/react-json-view` tree; all other files open in read-only Monaco that jumps to the matched line |
| **Recent Files (Cmd+E)** | Palette of the 30 most recently opened files, most-recent first, persisted in `localStorage`. Type to narrow by filename or path; arrow keys navigate; Enter opens. Same `mouseMovedRef` guard as Search Everywhere so Enter always opens the keyboard-highlighted row. Clear button wipes the list. Opening any file from Search Everywhere or Recent Files records it in history |
| **Find in Chat (Cmd+F)** | Inline find bar scoped to the active session's message list. Cmd/Ctrl+F slides in a compact bar between the chat header and messages; Escape or ✕ closes it and removes all highlights. mark.js (scoped to the scroll container, 120 ms debounce) wraps matches in `<mark>` elements — amber tint for all matches, accent-purple for the active one. Enter/↓ next match, Shift+Enter/↑ prev, wraps around. Re-pressing Cmd+F when bar is open re-focuses and selects the input. Cmd+F priority: terminal-open → terminal search (capture phase + stopPropagation); explorer focused → explorer filter; otherwise → chat find (bubble phase) |
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

---

### 🟡 Medium priority

- Mode fine tuning

---

### 🟢 Long-term

| What | Notes |
|---|---|
| **Built-in browser / visual preview** | Render the user's app, capture screenshots, run E2E checks — all within MA. High value for front-end work; high engineering cost |

---

## Out of scope

Explicit non-goals — they belong to a different product surface or a different strategic lane.

| What | Why |
|---|---|
| **Additional LLM providers** (Gemini, Bedrock) | No current plans; Copilot and ChatGPT Plus connections cover OpenAI models; curated OpenAI-compatible presets cover StepFun, DeepSeek, Moonshot, Together AI, Groq, OpenRouter, xAI, and custom endpoints; Ollama covers local inference |
| **IDE integration / inline completions** | Chat-first is the product; the market is moving toward agent-driven workflows |
| **Codebase semantic indexing** | Claude Code and Codex don't do this either; file tools + large context window is the right approach for this product class |
| **Self-hosted server / web UI** | Desktop-only by design |
| **Cron / scheduled agent runs** | A separate scheduling engine — not a chat app concern |
| **Custom rendering blocks** (html-preview, pdf-preview) | No tool architecture to produce them; datatable is the only custom renderer (added in v0.9.0) |
| **Theming / multi-language** | System theme only |
