# Minimalist Agent

**A focused AI coding agent for software engineers who value simplicity.**

Chat with Claude, GitHub Copilot, ChatGPT, or local models through a clean desktop interface. Full tool access, intelligent collaboration, built-in terminal, git integration, and powerful search — all without the bloat.

---

## Features

### AI Connections

- **Anthropic API key** — direct `sk-ant-` key; Opus 4.7 (1M ctx), Sonnet 4.6, Haiku 4.5
- **Claude Pro / Max OAuth** — browser PKCE flow, token auto-refresh
- **GitHub Copilot** — device-flow OAuth; live model discovery (Claude, GPT-5, GPT-5.1, and more); Copilot quota display
- **ChatGPT Plus / Codex** — browser OAuth; live model discovery via Pi SDK; full permission modes and tool streaming
- **Local model (Ollama)** — connect to any Ollama endpoint; live model discovery; no auth required
- **Extended context** — opt-in 1M token window for supported models (Anthropic Tier 4+)

### Agent Runtime

- **Full toolset** — Read, Write, Edit, Bash, Grep, Glob, WebFetch, WebSearch, Task via the `claude_code` SDK preset
- **Multi-phase planning** — complex tasks broken into phases with progress tracking, per-phase approval, and plan revision based on discoveries
- **Phase-level approval workflow** — configure when phases require approval based on risk level and autonomy settings
- **Subagents** — Task tool for Anthropic connections spawns subagents within a turn; parallel execution with git worktree isolation
- **Permission modes** — Plan (read-only) · Approve (require approval per phase) · Auto (intelligent execution with autonomy slider)
- **Intelligent collaboration** — 0-100% autonomy slider controlling how often the agent asks for decisions, approvals, and feedback
- **Mid-turn steering** — inject a message (with attachments) into a live turn without cancelling it (`Cmd+Enter`)
- **Continue after max turns** — one-click resume when the agent hits `max_turns`
- **Thinking / reasoning** — extended thinking with collapsible panels
- **Compaction** — persistent inline divider at compaction boundaries with token delta; survives reload

### Sessions & Projects

- **Persistent sessions** — full message history (`messages.jsonl` + `session.json`); resume across restarts
- **Projects** — group sessions by folder with name + color; per-project connection, model, permission mode, and Co-Authored-By defaults
- **Conversation branching** — fork a new session from any user message in history
- **Bulk session actions** — select multiple sessions to delete or archive at once
- **User Preferences** — name, timezone, location, language, free-text notes injected into every turn
- **Project context** — auto-discovers `CLAUDE.md` / `AGENTS.md` / `copilot-instructions.md` recursively

### Developer Tools

- **Terminal (`Cmd+T`)** — full in-app terminal (`xterm.js` + `node-pty`); real PTY, multiple tabs, in-terminal search, copy-on-select, URL click-to-open, 2 MB scrollback; three bundled fonts
- **File Explorer (`Cmd+B`)** — collapsible file tree panel with virtual scrolling for high performance with large directories; gitignore-aware, keyboard navigation, context menu (Copy Path / Reveal in Finder); persistent state across sessions
- **Git diff review (`Cmd+G`)** — full-screen Monaco DiffEditor; file list with M/N/D/R status; per-repo branch labels; collapsible file sections; hunk-level staging; commit panel with amend support; multi-repo workspace

### Search & Navigation

- **Search Everywhere (double-tap Shift)** — unified file name + content search; bundled `ripgrep` for fast full-text search; smart file viewer (Markdown, images, JSON tree, syntax-highlighted code)
- **Recent Files (`Cmd+E`)** — palette of the 30 most recently opened files, type to filter
- **Keyboard shortcut map** — Settings → Shortcuts panel with every keybinding

### Extensions & Skills

- **MCP servers** — stdio + HTTP/SSE transports; consent gate; encrypted secrets per extension
- **CLI-bound & guide-only extensions** — drop a directory into `<userData>/extensions/`
- **Skills** — reusable `SKILL.md` instruction sets invoked with `@slug`
- **`@`-mention picker** — extensions and skills surfaced alongside files in the mention picker

### UI & Rendering

- **Rich code blocks** — Shiki syntax highlighting; expand-to-fullscreen on every block
- **Mermaid diagrams** — rendered SVG with zoom/pan, copy raw source, expand modal
- **KaTeX math** — `$$...$$` expressions rendered as typeset equations
- **JSON tree viewer** — collapsible interactive tree for tool results and structured data
- **Datatable renderer** — ` ```datatable ` fenced blocks render as interactive tables
- **Inline diffs** — unified diff + split-view modal for Edit/Write tool calls
- **Smart snippet attachments** — large clipboard pastes auto-converted to named snippet chips with language detection and inline preview
- **Turn duration** — elapsed time displayed in each message bubble
- **Auto-update** — ships new releases automatically via GitHub Releases

---

## Quick Start

### Download

Get the latest release for your platform from the [Releases page](https://github.com/thehope2k/minimalist-agent/releases).

| Platform              | File                            |
|-----------------------|---------------------------------|
| macOS (Apple Silicon) | `Minimalist-Agent-arm64.dmg`    |
| macOS (Intel)         | `Minimalist-Agent-x64.dmg`      |
| Windows               | `Minimalist-Agent-x64.exe`      |
| Linux                 | `Minimalist-Agent-x64.AppImage` |

### Setup

1. **Launch the app** (see macOS Gatekeeper note below if blocked)
2. **Add a connection** — Settings → Connections
   - Anthropic: Paste your API key or sign in with Claude Pro/Max
   - GitHub Copilot: Sign in via device flow
   - ChatGPT: Sign in via browser OAuth
   - Local: Point to your Ollama endpoint
3. **Start chatting** — `Cmd+N` for new session

### macOS — Gatekeeper

The macOS build is currently unsigned. On first launch macOS will block it.  
To open: **right-click the app → Open → Open** (you only need to do this once).

Alternatively:

```bash
xattr -d com.apple.quarantine /Applications/Minimalist\ Agent.app
```

---

## Build from source

**Prerequisites:** Node 22+, [Bun](https://bun.sh) (or npm)

```bash
git clone https://github.com/thehope2k/minimalist-agent.git
cd minimalist-agent
bun install
bun run dev        # dev mode with HMR
bun run typecheck  # type-check only
bun run pack       # local build → release/
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full development guide.

---

## Stack

- Electron + electron-vite
- React 18 + TypeScript
- Tailwind CSS v4
- `@anthropic-ai/claude-agent-sdk` + `@earendil-works/pi-coding-agent`
- xterm.js + node-pty (terminal)
- Monaco Editor (git diff / file viewer)
- `@vscode/ripgrep` (Search Everywhere)
- Radix UI (tooltips, popovers)

---

## Why Minimalist Agent?

- **Multi-provider** — switch between Anthropic, GitHub Copilot, ChatGPT, and local models from one interface
- **Developer-first** — built-in terminal, git diff viewer, file explorer, and powerful search
- **Intelligent collaboration** — adjustable autonomy from "ask me everything" to "just get it done"
- **Planning workflow** — break down complex tasks into phases with approval and revision
- **Privacy-focused** — local storage, encrypted secrets, no telemetry
- **Extensible** — MCP servers, CLI-bound extensions, and reusable skills
- **Open source** — MIT licensed, built with modern web tech

---

## Documentation

### User Guides
- [Changelog](CHANGELOG.md) — what's new in each release
- [Roadmap](docs/ROADMAP.md) — what's in, what's coming, what's out of scope

### Technical
- [Architecture](docs/ARCHITECTURE.md) — agent pipeline, event flow, storage layout
- [Agent Definitions](docs/AGENT-DEFINITIONS.md) — reusable agent configurations and sub-agent system
- [Collaboration](docs/COLLABORATION.md) — autonomy system and intelligent engagement
- [Terminal](docs/TERMINAL.md) — in-app terminal reference
- [Worktree Isolation](docs/WORKTREE-ISOLATION.md) — parallel agent isolation via git worktrees

### Contributing
- [Contributing](CONTRIBUTING.md) — development setup and guidelines
- [Security](SECURITY.md) — vulnerability reporting

---

## License

[MIT](LICENSE) © 2026 The Hope
