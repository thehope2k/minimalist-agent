# Minimalist Agent

A focused AI coding agent for software engineers who value simplicity.  
Everything you need to work with Claude — nothing you don't.

---

## Features

- **Multiple auth paths** — Anthropic API key, Claude Pro/Max OAuth, GitHub Copilot
- **Full agent toolset** — Read, Write, Edit, Bash, Grep, Glob, WebFetch, WebSearch via the `claude_code` SDK preset
- **MCP servers** — connect any MCP tool via the Extensions panel (stdio + HTTP/SSE)
- **Skills** — reusable `SKILL.md` instruction sets invoked with `@slug`
- **Permission modes** — Plan · Ask · Auto per session
- **Project context** — auto-discovers `CLAUDE.md` / `AGENTS.md` in your working directory
- **Persistent sessions** — full message history with resume across restarts
- **Rich UI** — syntax-highlighted code, Mermaid diagrams, inline Edit/Write diffs, thinking panels
- **Extended context** — opt-in 1M token window for supported models
- **Auto-update** — ships new releases automatically via GitHub Releases

---

## Install

Download the latest release for your platform from
the [Releases page](https://github.com/thehope2k/minimalist-agent/releases).

| Platform              | File                            |
|-----------------------|---------------------------------|
| macOS (Apple Silicon) | `Minimalist-Agent-arm64.dmg`    |
| macOS (Intel)         | `Minimalist-Agent-x64.dmg`      |
| Windows               | `Minimalist-Agent-x64.exe`      |
| Linux                 | `Minimalist-Agent-x64.AppImage` |

### macOS — Gatekeeper

The macOS build is currently unsigned. On first launch macOS will block it.  
To open it: **right-click the app → Open → Open** (you only need to do this once).

Alternatively, from the terminal:

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
- `@anthropic-ai/claude-agent-sdk` + `@mariozechner/pi-coding-agent`

---

## Docs

- [Architecture](docs/ARCHITECTURE.md) — agent pipeline, event flow, storage layout
- [Roadmap](docs/ROADMAP.md) — what's in, what's coming, what's out of scope
- [Changelog](CHANGELOG.md)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)

---

## License

[MIT](LICENSE) © 2026 The Hope
