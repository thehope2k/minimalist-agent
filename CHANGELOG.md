# Changelog

All notable changes are documented here.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [0.6.0] — 2026-05-08

Adds attachment support to mid-turn message injection; fixes Mermaid cylinder shapes failing to render.

### Added

**Attachments in mid-turn steer**

- Images, PDFs, text files, and snippets can now be attached when injecting a message into a running turn via the Steer button (⌘+Enter)
- The Paperclip button is no longer disabled while the agent is streaming
- Attached files appear in the ghost "Injected mid-turn" bubble so there is a visible record of what was sent
- Attachments are restored to the composer if the steer fails, matching the existing text restore behaviour

### Fixed

**Mermaid diagram rendering**

- Cylinder / database node shapes (`[("text\nmore")]`) were being mangled by the `preprocessMermaid` function, producing an unmatched inner quote that caused Mermaid to fall back to raw source. The preprocessor now correctly preserves `(…)` delimiters when converting `\n` to `<br/>`.

---

## [0.5.0] — 2026-05-08

Adds smart snippet attachments for large clipboard pastes.

### Added

**Smart snippet attachments**

- Large clipboard pastes (≥30 lines or ≥1 500 chars) are automatically converted into named snippet chips instead of flooding the composer
- Snippet chip shows a language badge and line count in the attachment strip
- Hover the chip for a popover preview of the first ~8 lines
- Click the chip to open a full edit modal — rename, edit content, or change the detected language
- Language auto-detection covers 16+ languages via a new pure-sync heuristic (`lib/language-detect.ts`)
- Snippet content is fully delivered to the AI: Anthropic backend receives a fenced code block; Pi backend prepends it to the prompt — previously text attachments were silently dropped
- Session Info panel: snippet and code-file entries now show a `FileCode` icon with accent colour and an inline toggle-preview instead of only a Finder reveal button

---

## [0.4.0] — 2026-05-08

SDD quality of life improvements and bug fixes.

### Changed

**SDD defaults**

- SDD mode now defaults to **off** for new sessions — users who want it must enable it explicitly per session
- Long-running turn warning threshold raised from the previous value to **5 minutes**

### Fixed

**SDD panel**

- Corrected speckit path convention: specs are now resolved from `$root/specs/` instead of `.specify/specs/`
- Eliminated panel flash and stale data shown when switching between sessions (BUG-SDD-07)

---

## [0.3.1] — 2026-05-06

SDD panel quality-of-life improvements. Adds active feature pinning, lazy rule injection, and phase action buttons;
fixes badge layout and number alignment.

### Added

**SDD panel interactions**

- Active feature is now pinned at the top of the entity card so it stays visible when the list is long
- Phase action buttons surface the most relevant next action (e.g. run the next phase) directly in the panel without
  opening a separate dialog
- Rule injection is now lazy — SDD context rules are only added to the system prompt when the relevant feature is
  active, reducing prompt bloat

### Fixed

- **FeatureRow badge layout**: badge pills and task-count numbers were misaligned in narrow panel widths; layout is now
  stable across all widths

---

## [0.3.0] — 2026-05-06

SDD workspace panel improvements and bug fixes. Adds entity-level constitution view, polished artifact rendering with
syntax highlighting and custom checkboxes, and fixes two SDD reliability issues.

### Added

**SDD entity-level constitution view**

- Constitution is now a first-class entry in the entity card, above the features list — click to open a dedicated viewer
  without needing to open a feature first
- `ConstitutionViewer` reloads live when `constitution.md` changes on disk
- Constitution tab removed from per-feature artifact viewer (now lives at entity level only)

**SDD artifact viewer polish**

- Fenced code blocks in spec/plan/tasks now render with full Shiki syntax highlighting
- Inline code styled as accent-tinted pill to stand out from surrounding prose
- Improved typographic hierarchy: h1/h2/h3 at full brightness, body at muted, `strong` pops from text
- Task checkboxes fully custom-styled (appearance: none); checked state uses green to distinguish from accent purple

### Changed

- **Artifact badges redesigned**: emoji (✅ ⏳) replaced with compact text symbols (✓ ○); feature slug bumped to
  `text-sm`; badges no longer wrap in narrow panels
- **SDD markdown rendering extracted** to `SddMarkdown.tsx` shared module — `SddArtifactViewer` now only owns
  interactive checkbox logic

### Fixed

- **SDD session switch empty panel**: switching A → new session → back to A would show “No SDD specs found” — `useSdd`
  refs are now reset on session clear so the re-scan fires correctly on return
- **macOS bundled app “CLI missing” warning**: when launched from Dock/Finder, macOS strips PATH to
  `/usr/bin:/bin:/usr/sbin:/sbin`; main process now prepends `~/.local/bin`, `/opt/homebrew/bin`, `/usr/local/bin` at
  startup so `specify`, `gh`, and other user-installed tools are found

---

## [0.2.0] — 2026-05-06

Adds native Spec-Driven Development (SDD) support and Copilot quota tracking. Quality of life improvements and several
Pi/Copilot reliability bug fixes.

### Added

**Spec-Driven Development (SDD)**

- Native SDD workspace panel in the chat layout — auto-detects `.specify/` entities in the working directory and
  displays a resizable side panel with entity cards, phase badges, and an artifact viewer
- Artifact viewer opens the live spec file for each SDD entity with a per-phase default tab; checkboxes in task lists
  are toggleable directly from the panel
- Phase badge derives the current phase from the artifact state and shows it on each entity card
- SDD mode toggle (auto / off) persisted per session; init wizard launches `specify init` from inside the app when no
  `.specify/` directory is found
- File-system watchers keep the panel in sync as spec files change on disk
- SDD context injected into the agent system prompt automatically when active
- SDD scan depth configurable in Settings → AI

**Copilot quota tracking**

- Premium request quota usage shown for Copilot connections — displays remaining requests and resets when the billing
  cycle rolls over

**Other**

- Brief "Already on latest version" toast when checking for updates and no newer release exists

### Fixed

**Pi / Copilot reliability**

- "Agent is already processing" error after a turn ended: a race between the Pi SDK’s subscription events firing before
  `session.prompt()` resolved caused the next send to fail with a double-send workaround required. A new
  `activePromptPromise` guard ensures the previous call settles before the next begins
- Sessions continuously reordered in the sidebar while multiple turns ran simultaneously: `replaceLastMessage` was
  bumping `lastMessageAt` on every 1-second checkpoint write and triggering a full list reload, causing sessions to
  leapfrog each other. Checkpoint writes are now metadata-silent and don’t re-sort the list
- "terminated" HTTP/2 errors from the Copilot gateway now surface as a clear "Connection terminated" message with a
  Retry button instead of the generic "Something went wrong" fallback
- "Anthropic stream ended before message_stop" errors shown on Copilot connections (the word "Anthropic" referred to the
  wire protocol, not the connection) — now shown as "Stream interrupted" with neutral copy
- All successfully completed Pi/Copilot turns no longer show a spurious amber "stop" badge; the badge is now suppressed
  for normal completions the same way it is for Anthropic turns
- Streaming spinner shows a subtle ⚠️ warning after 90 seconds to indicate the turn may be silently retrying a
  connection error

**Markdown rendering**

- Fenced code blocks without a language tag were rendered as inline `code` instead of a proper code block

**Mermaid diagrams**

- Diagrams containing `\n` escape sequences in node labels now render correctly instead of showing a parse error
- Expand-to-fullscreen modal fits the diagram to the window on open

---

## [0.1.7] — 2026-05-04

### Fixed

**Check for Updates**

- The "Check Now" button was a stub (fake 800ms spinner, no real check) —
  it now calls the actual update API which queries GitHub Releases
- Update errors were silently hidden; the banner now shows an amber
  "Update check failed" notice with a direct link to the GitHub Releases
  page so users can download manually (relevant on macOS without code
  signing where `electron-updater` cannot install updates automatically)

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
