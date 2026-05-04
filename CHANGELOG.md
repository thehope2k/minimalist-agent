# Changelog

All notable changes are documented here.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [0.1.6] — 2026-05-04

### Fixed

**Scroll arrows**

- Arrows no longer overlap message content at any panel width — a reserved
  `pr-12` right margin on both the message list and the composer creates a
  dedicated gutter, and the arrow position tracks the message column edge via
  a CSS `calc` formula so the gap stays consistent whether the sidebar is
  collapsed or expanded

---

## [0.1.5] — 2026-05-04

### Added

**Expand to fullscreen**

- Shared `ExpandModal` primitive — code blocks, images, and tool results can
  now be expanded to a full-screen overlay (click the expand icon or press Esc
  to close)
- Mermaid diagrams get their own expand button; the modal fills the viewport
  and supports zoom + pan (pinch / scroll to zoom, drag to pan)
- Zoom + pan also applies to images in the expanded view
- KaTeX math rendering for `$$…$$` and `$…$` expressions in assistant replies
- JSON tree viewer for tool results that contain raw JSON — collapsible nodes,
  copy-to-clipboard
- System prompt guidance for diagrams injected automatically

### Changed

- **Plan mode block message** is now tool-aware: when `bash` is blocked, the
  model is told which read-only tools to use instead and how to switch modes —
  reducing dead-end loops where the agent just repeated the error
- **Session title** capped at 7 words (down from 8) — keeps titles snappier in
  the sidebar
- **Session list** padding slightly reduced (`py-3` → `py-2.5` on rows,
  `py-2` → `py-1.5` on date headers) — saves ~4 px per row without feeling cramped

### Fixed

- **Scroll arrows** — multiple rounds of anchoring fixes; arrows now sit
  precisely on the right edge of the message content column with no overlap
  and no layout shift when the panel is resized
- **Code block syntax highlighting** — full language names (`typescript`,
  `python`, `bash`, etc.) now resolve correctly in addition to short aliases
- **Sidebar panel sizes** — minimum sizes relaxed for more flexible
  narrow-window layouts; `maxSize` tightened from 45 → 38 to prevent the
  sidebar from dominating on wide screens

---

## [0.1.4] — 2026-05-04

### Fixed

**Pi-server sessions — false "Turn was interrupted" on reload**

- `event-adapter.ts` now emits `{ type: 'turn_done', stopReason: 'stop' }` for
  `agent_end` events; previously the bare `turn_done` (no `stopReason`) caused
  every completed pi-server turn to be flagged as a zombie on next load
- `applyEvent` uses `stopReason: evt.stopReason ?? 'stop'` as a defensive
  fallback so sessions already on disk without a `stopReason` are also healed

**Session list reordering after visiting an old session**

- The zombie-correction path now preserves the original `createdAt` timestamp
  when calling `replaceLastMessage`, preventing `meta.lastMessageAt` from being
  bumped to `Date.now()` and causing the session to jump to the top of the list
- `ChatMessage` now carries an optional `createdAt` field (threaded through
  `chatFromStored`) so the round-trip has access to the original timestamp

---

## [0.1.3] — 2026-05-04

### Added

**Projects**

- New "Project" concept for grouping sessions — pick a folder, give it a
  name + color, and any new session opened in (or under) that folder
  auto-joins the project
- Top-bar project switcher (All Sessions / Inbox / each project, plus
  "Manage projects…")
- Per-project defaults: permission mode and connection (model defaults
  to whatever the connection ships with)
- Sessions remember their last connection + model on disk and restore
  the pill on switch — no more "global default" flicker between sessions
- Sidebar filters and color dots; right-click a session to move it
  between projects or to Inbox
- Settings → Projects panel: list, create, edit, delete (sessions move
  to Inbox on project deletion)

**Mentioning**

- Extensions are now first-class citizens in the `@`-mention picker
  alongside Skills and Files (filterable, scored, with avatar)
- Mentioning an enabled extension injects a "MUST read guide.md first"
  directive into the system prompt, mirroring how skills work
- Renderer chips render extension mentions with the extension's avatar
  and display name

**Compaction**

- Persistent inline divider in the chat at every compaction boundary
  (amber dashed line, scissors icon, "saved Nk tokens"); survives
  reload via the message log
- Hover divider for trigger / before / after token counts

**Mid-turn steering**

- `Cmd/Ctrl + Enter` while a turn is streaming injects your message
  into the running turn (uses the SDK's native streaming-input path)
- Inline hint under the input explains the shortcut while streaming
- Steered messages render as a dashed-outline ghost bubble tagged
  "Injected mid-turn" so you have visual confirmation it landed

**User message actions**

- Hover a sent message → Copy button puts text + attached images into
  the clipboard as one write (apps that handle both, like Slack /
  Notion, paste both; image-only paste targets get the image)
- Right-click an image attachment to copy it without the surrounding
  text
- Click an image → fullscreen lightbox (Esc / click-outside to close);
  the filename above the image still opens it in Finder

**Build**

- `scripts/generate-icons.mjs` produces `build/icon.png` (1024) and a
  full macOS `build/icon.icns` from the SVG in `app-icon.ts`. Wired
  into `pack` and `release` so packaged builds carry the right Finder
  / Applications / Spotlight icon

### Changed

**Top bar redesign**

- Project switcher and segmented nav (Sessions / Skills / Extensions /
  Archived / Settings) sit at matched heights with a soft container
- Active tab uses an accent-tinted background instead of a flat ring
- Sidebar toggle uses lucide's `PanelLeftOpen` / `PanelLeftClose` and
  flips state-aware

**Panel headers**

- Sessions / Skills / Extensions / Archived now share the same header
  shape: `h-10`, hairline bottom border, same `Button` primitive for
  the "New" action
- Headings bumped to `text-[15px] font-semibold` across panels
- Chat title drops the chevron (was a non-functional dropdown look)

**Sessions sidebar**

- Softened row dividers and made the active / hovered row absorb the
  border so the highlight reads as one block (no "gap above active")
- Auto-pick latest unarchived session respects the active project
  filter

**Archived view**

- Selecting nothing in Archived shows a quiet placeholder instead of
  the new-session UI ("Select an archived session to view it")

**Context badge**

- Switched from the SDK's aggregate `result.usage` (which sums across
  every internal API call in a turn — exceeded the context window on
  tool-heavy turns) to **per-call** usage, captured from each
  `assistant` SDK message. Reflects the real prompt size at the
  latest call
- Tooltip surfaces the cache split (new / cache read / cache create)

**Extensions reference doc** (`reference-doc.ts`)

- Hard `MUST` rule against inlining credentials in `extension.json` —
  was previously a soft "use" recommendation
- Concrete shape patterns for what counts as a credential
  (`ghp_…`, `sk-…`, `xoxb-…`, `AKIA…`, JWTs, etc.)
- Wrong / right examples side-by-side
- Explicit guidance: agent should NOT echo tokens back into chat;
  user sets values via the Secrets UI / `setSecret` IPC
- New "Secrets are scoped per extension" section explaining the
  `<slug>::<keyName>` namespacing — multi-account setups (e.g. work +
  personal GitHub) get separate extensions with isolated credentials,
  no key collisions
- Reference doc version bumped so the install pass refreshes the
  on-disk copy

### Fixed

- New session inside a project filter now correctly seeds working
  directory from `project.rootPath` and permission mode from
  `project.defaultPermissionMode` (previously fell straight through to
  global defaults)
- Picker override (`pickerOverride`) no longer leaks across session
  switches — each session restores its own remembered connection /
  model
- `Edit` / `Write` tool chips no longer show "Edited file" in past
  tense while still streaming; they show "Editing file…" / "Writing
  file…" with a spinner until the call completes

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
