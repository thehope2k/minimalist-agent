# Roadmap

What's in, what's coming, and what's intentionally out of scope.

---

## What's implemented

| Capability                     | Detail                                                                                                                                                                                                                       |
|--------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Anthropic API key**          | Direct API connection - works with any Anthropic-tier account                                                                                                                                                                |
| **Claude Pro/Max OAuth**       | Sign in via PKCE flow; token auto-refresh                                                                                                                                                                                    |
| **GitHub Copilot**             | Device-flow OAuth; live model discovery; mid-session token refresh; Copilot quota display                                                                                                                                    |
| **Built-in agent tools**       | Read, Write, Edit, Bash, Grep, Glob, WebFetch, WebSearch, Task - via `claude_code` SDK preset (Anthropic backend). Pi/Copilot backend has its own equivalent set excluding Task.                                             |
| **Subagents (Anthropic only)** | Task tool available on Anthropic connections - model can spawn subagents within a turn. Not available on Copilot/Pi backend.                                                                                                 |
| **MCP servers**                | stdio + HTTP/SSE transports, consent gate, encrypted secrets - managed through the Extensions panel                                                                                                                          |
| **Extensions**                 | MCP-backed, CLI-bound, and guide-only variants; drop a directory into `<userData>/extensions/`                                                                                                                               |
| **Skills**                     | `SKILL.md` files invoked with `@slug`; global tier under `<userData>/skills/`                                                                                                                                                |
| **@-mention picker**           | Extensions and Skills surfaced as first-class citizens in the mention picker alongside files                                                                                                                                 |
| **Projects**                   | Group sessions by folder with name + color; per-project defaults for connection, model, permission mode; sidebar filter and color dots                                                                                       |
| **Sessions**                   | Full persistence (`messages.jsonl` + `session.json`); resume across restarts; SDK session ID preserved for resumable turns                                                                                                   |
| **Compaction**                 | Persistent inline divider at compaction boundaries with token delta; survives reload                                                                                                                                         |
| **Permission modes**           | Plan (no mutations), Ask (per-tool prompt), Auto (bypass) - per session and global default                                                                                                                                   |
| **Safe bash auto-allow**       | ~55 read-only bash commands auto-allowed in Ask mode; dangerous constructs (`$()`, redirects, `&`, env assignment, `find -exec`) always blocked. Both backends covered.                                                      |
| **Mid-turn steering**          | Inject a message (with attachments) into a live agent turn without cancelling it                                                                                                                                             |
| **Project context**            | Auto-discovers `CLAUDE.md` / `AGENTS.md` / `copilot-instructions.md` recursively; injected into every turn; configurable names                                                                                               |
| **User Preferences**           | Name, timezone, location, language, free-text notes - injected into every system prompt                                                                                                                                      |
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
| **Git diff review modal**      | Full-screen modal (`Cmd+G` or chat header button). Pure `git status` + `git diff HEAD` showing uncommitted changes. Left panel: file list grouped by git root with `M`/`N`/`D`/`R` color-coded status, `↑↓` keyboard nav. Right panel: Monaco DiffEditor, split/unified toggle, VS Code Dark+ theme, auto-scroll to first hunk. Multi-repo workspace support. |
| **Git commit flow**            | Extends Cmd+G modal. File-level checkboxes + hunk-level staging via Monaco glyph margin icons (one per diff hunk, left gutter of modified pane). Partial-hunk commits use `git hash-object + update-index` so disk file is never touched. Commit panel: 6-row textarea, `Cmd+Enter` submit, amend checkbox (pre-fills last message, restores on uncheck, amber UI), multi-repo footer shows which repos will be committed. |
| **Keyboard shortcut map**      | Settings → Shortcuts panel listing all shortcuts with styled key chips (`⌘`/`⇧`/`↵` symbols, `+` connectors, physical-key shadow). `Cmd+N` new session, `Cmd+T` terminal toggle, `Cmd+G` git modal, Double Shift search, and all terminal tab shortcuts. |
| **Tooltips**                   | Radix `@radix-ui/react-tooltip` replacing the native `title` attribute across all `IconButton` usages app-wide. 400 ms delay, consistent styling, `TooltipProvider` at root. |
| **Search Everything (Double Shift)** | Double-tap Shift (<300 ms delta, any other key resets) opens a unified search palette — mirrors IntelliJ's "Search Everywhere" All tab. Single input, two progressive sections: **Files** (fuzzy filename search, instant, reuses `files:search` IPC + client-side scoring) and **In files** (full-text grep via bundled `@vscode/ripgrep`, debounced 250 ms, `asarUnpack` so binary runs from disk). Selecting any result opens a smart file viewer: Markdown renders with the full chat renderer (remark-gfm, remark-math/KaTeX, Shiki code blocks, Mermaid, JSON tree) plus a Source toggle; images (PNG/JPG/GIF/WebP/SVG/AVIF) open in a ZoomPan canvas with scroll-to-zoom + drag-to-pan; JSON/JSONC files show an interactive `@uiw/react-json-view` tree (falls back to Monaco for invalid JSON); all other files open in a read-only Monaco editor that jumps to the matched line for grep results. |
| **Terminal (Cmd+T)**           | Full persistent terminal panel (`xterm.js` + `node-pty`). Real PTY — interactive processes work correctly. **Multiple tabs** with `Cmd+←/→` switching, `Cmd+Shift+T` new tab, `Cmd+Shift+W` close tab. **Resizable** with `Cmd+Shift+↑/↓` (3 % steps). Panel toggle survives close/reopen — PTY and scrollback (2 MB ring buffer) persist in main process. CWD seeded from active session on first open. **Cmd+K** clear, **Cmd+F** in-terminal search (xterm `SearchAddon`, live highlight), **copy-on-select** via `onSelectionChange`, **right-click context menu** (Copy/Paste/Clear), **URL Cmd+Click** opens in system browser via `shell.openExternal`. Three fonts bundled (JetBrains Mono default, Fira Code, Cascadia Code); system fonts (Menlo, Monaco, Courier New) also listed. Settings panel: shell file picker (opens at `/bin`, shows full path), font family dropdown, font size dropdown, scrollback preset selector. `node-pty` rebuilt for Electron ABI via `@electron/rebuild` postinstall; `asarUnpack` configured for distribution. |

---

## What's coming

These are understood, scoped, and on the roadmap - just not shipped yet.

### 🔴 High priority

| What                             | Notes                                                                                                                                                                                                                                                                                                  |
|----------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Hooks / lifecycle automation** | Per-session hooks that fire shell commands on lifecycle events: `on_turn_done`, `on_file_write`, `on_tool_use`. Closes the agent feedback loop automatically - runs tests, typechecks, linting, or `gh pr create` without the user having to ask. MVP: a simple command config per session or project. |

### 🟢 Long-term

| What                                  | Notes                                                                                                                                                                                                                                      |
|---------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Built-in browser / visual preview** | Render the user's app, capture screenshots, run E2E checks - all within MA. High value for front-end work; high engineering cost.                                                                                                          |
| **SDD: Task → session queue**         | Parse `tasks.md` checkboxes and offer "Spawn sessions for all tasks" - each unchecked task becomes a child session pre-loaded with `spec.md` + `plan.md` context, checks its box on completion. Depends on parallel session support above. |

---

## What's intentionally out of scope

These are explicit non-goals - they belong to a different product surface or a different strategic lane.

- **Additional LLM providers** (OpenAI direct, Gemini, Bedrock, Ollama) - no current plans; Copilot already proxies a
  range of models for users who need multi-provider access
- **IDE integration / inline completions** - chat-first is the product; the market is moving toward agent-driven
  workflows anyway
- **Codebase semantic indexing** - Claude Code and Codex also don't do this; file tools + large context window is the
  correct approach for this product class
- **Self-hosted server / web UI** - desktop-only by design
- **Cron / scheduled agent runs** - a separate scheduling engine, not a chat app concern
- **Custom rendering blocks** (datatable, html-preview, pdf-preview) - no tool architecture to produce them
- **Theming / multi-language** - system theme only
