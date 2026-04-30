# Changelog

All notable changes are documented here.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [0.1.0] — 2026-05-03

Initial public release.

### Added

**Connections & Auth**

- Anthropic API key connection with connection-test button
- Claude Pro/Max OAuth via PKCE (manual code-paste flow); token auto-refresh
- GitHub Copilot OAuth via device flow; live model discovery; mid-session token refresh
- All credentials stored encrypted via Electron `safeStorage` (OS keychain)

**Agent runtime**

- Full Claude Agent SDK integration — Read, Write, Edit, Bash, Grep, Glob, WebFetch, WebSearch, Task tools via the
  `claude_code` preset
- Permission modes: Plan (read-only), Ask (per-tool prompt with allow-once / allow-session), Auto (bypass)
- Project context auto-discovery (`CLAUDE.md` / `AGENTS.md`) injected into every turn
- `settingSources: ['user', 'project', 'local']` — honours workspace and user-level Claude settings
- Configurable `maxTurns` (default 50); stop-reason display
- Mid-turn steering — inject a follow-up message into a running agent turn
- Extended context (1M token) opt-in for Opus 4.7 on Anthropic Tier 4+
- Session persistence (`messages.jsonl` + `session.json`); resume across restarts

**MCP & Extensions**

- MCP server support (stdio + HTTP/SSE) via the Extensions system
- Consent gate and per-extension secret storage before any MCP server connects
- CLI-bound and guide-only extension variants
- Extensions panel: install, enable/disable, manage secrets

**Skills**

- `SKILL.md` loader with `@slug` mention in the composer
- Global skill tier under `<userData>/skills/`

**UI**

- Three-column shell: session list · chat · sidebar (projects, skills, extensions)
- Parts-based message rendering: text, tool calls, thinking, diffs, errors
- Inline unified diff + split-view modal for Edit/Write tool calls
- Markdown rendering with Shiki-highlighted code blocks and Mermaid diagrams
- Session info popover (token usage, cache reads/writes, cost estimate)
- User Preferences panel (name, timezone, location, language, notes)
- Projects panel with pinned working directories
- Auto-update via `electron-updater` pulling from GitHub Releases

**Platform**

- macOS (arm64 + x64), Windows (x64), Linux (x64 AppImage)
