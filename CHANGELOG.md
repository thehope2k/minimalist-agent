# Changelog

All notable changes are documented here.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [1.16.0] — 2026-07-13

Adds automatic session cleanup on startup; bug fixes.

### Added

- Archived and empty sessions are now automatically purged on startup, keeping the session list clean without any manual housekeeping
- Context panel now has a close button

### Fixed

- Agent runtime timeout is now measured from when the task actually starts rather than when the request was created, preventing premature timeouts on queued tasks

---

## [1.15.0] — 2026-07-11

Adds meethtml.com as a second HTML share backend; bug fixes.

### Added

**Dual share backends**

- **meethtml.com** is now available alongside BrewPage as a share target — both for per-response actions (footer buttons) and full session export (header menu). BrewPage links expire in 15 days; meethtml links expire in 24 hours. Both are unlisted, no signup required, and support revoke via owner token.
- Session export menu now shows four share options: Conversation and Full Log for each backend

### Fixed

- Agent slug validation now checks against actually-available agents at runtime, preventing silent failures when an agent definition is missing or mis-slugged

---

## [1.14.0] — 2026-07-11

Adds per-response sharing actions; project context files now eagerly loaded; agent scope awareness fixed.

### Added

**Per-response sharing**

- Copy / Save / Share action bar in the assistant message footer (hover to reveal): **Copy** writes both `text/html` and `text/plain` so pasting into Teams, Slack, or Notion renders with full formatting instead of raw markdown; **Save** exports just the response as a standalone HTML file; **Share** publishes it as an ephemeral BrewPage link
- Action buttons are now right-aligned in the footer, mirroring the user message copy button

**Project context**

- Root `AGENTS.md` / `CLAUDE.md` content is now injected directly into the system prompt (eager) rather than listed as a pointer, so the agent sees project conventions reliably even after compaction

### Fixed

- Agent now uses correct paths for skills and extensions — user-global `~/.minimalist-agent/` and project `<cwd>/.minimalist-agent/` with project scope taking precedence. Previously the system prompt referenced a wrong `<userData>` path and incorrectly described skills as global-only. The bundled `skills.md` and `extensions.md` reference docs are updated accordingly.
- Extensions awareness block in the per-turn prefix now emits scope-aware guide path hints (separate lines for global vs project extensions) instead of a single hardcoded user-tier path

---

## [1.13.0] — 2026-07-09

Project-scope asset creation from the context panel; quality of life improvements to creation dialogs.

### Added

**Project-scope asset creation**

- Context panel's project section now always shows when a session has a working directory, even when empty — making it the natural place to start building project-local assets
- `+ New` dropdown in the project section header lets you create skills, agents, and extensions directly into `<cwd>/.minimalist-agent/` without leaving the session
- New sessions spawned from project-scope creation open rooted at the project directory so the agent writes files to the right place automatically

### Changed

- Slug field in New Skill, New Agent, and New Extension dialogs is now optional — leave it blank and the agent picks an appropriate name based on the description
- New Agent dialog visual style now matches New Skill and New Extension (consistent header, footer, field layout, and keyboard shortcuts)

---

## [1.12.2] — 2026-07-09

Quality of life improvements and bug fixes.

### Changed

- Hunk-level partial staging removed from the git diff view; the staging banner is restored to its previous position
- Project-assets indicator moved from the chat banner to the header icon for a cleaner layout

### Fixed

- Skill and extension @mention resolution is now scoped to the active project, preventing cross-project asset leakage
- File explorer side panel enforces a minimum 30% width when expanded, preventing accidental collapse to an unusable size
- Context badge tooltip now uses the structured Tooltip component instead of a plain HTML `title` attribute

---

## [1.12.1] — 2026-07-08

Bug fix: context badge now shows live context pressure instead of an inflated token total that included cached history.

### Fixed

**Context badge**

- The context usage percentage now measures live tokens (`input + cache_creation`) rather than the full sum including `cache_read`; cache-read tokens are served from the prompt cache and don't consume context window space, so the old calculation overstated proximity to the compaction threshold
- Tooltip now shows a full breakdown: live tokens, cached tokens, running total, and how many times the conversation has been compacted
- Compaction count appears inline on the badge (e.g. `42% · 2×`) when the conversation has been compacted at least once

---

## [1.12.0] — 2026-07-08

Adds project-scope tier for skills, agents, and extensions; new Context Panel (Cmd+Shift+B) to discover and pin assets per session.

### Added

**Project-scope tier for skills, agents, and extensions**

- Skills, agents, and extensions can now live in `<project>/.minimalist-agent/` alongside the existing user tier (`~/.minimalist-agent/`); the project tier takes precedence over the user tier, making assets git-committable and team-shareable
- Project-tier extensions are always active — no toggle needed; MCP servers in this tier are auto-consented, with env vars resolved from `process.env` (no keychain prompt)
- On first launch, existing userData assets are automatically migrated to `~/.minimalist-agent/` (idempotent, guarded by a marker file) so nothing is lost

**Context Panel (Cmd+Shift+B)**

- New panel for discovering and pinning skills and agents from both the project tier and the user tier; accessible via the keyboard shortcut or the toolbar
- Pinned assets persist across the session (stored in `session.json → pinnedAssets`) and are surfaced to the model automatically
- Project-local config card in the chat header shows which project-scope assets are active for the current working directory

---

## [1.11.0] — 2026-07-02

New feature: find in chat. Press Cmd/Ctrl+F to search and highlight text across the active session's full message history.

### Added

**Find in Chat (Cmd/Ctrl+F)**

- Pressing Cmd+F (macOS) or Ctrl+F (Windows/Linux) opens an inline find bar between the chat header and the message list; Escape or ✕ closes it and removes all highlights
- All matches are highlighted with an amber tint; the active (navigated) match is highlighted in accent-purple with an outline
- Match counter shows current position (`3 / 12`); turns red with `No results` when the query has no matches
- Navigate with Enter / ↓ (next) and Shift+Enter / ↑ (prev); active match is smoothly scrolled to the centre of the viewport
- Re-pressing Cmd+F when the bar is already open re-focuses and selects the input text, matching browser find-in-page behaviour
- Keyboard shortcut priority: terminal-open → terminal search (existing behaviour unchanged); file explorer focused → explorer filter; otherwise → chat find

---

## [1.10.3] — 2026-07-01

Dependency updates and infrastructure: Electron 43, react-resizable-panels v4, pi-ai 0.80 API, and safe package updates.

### Changed

**Runtime**

- Upgraded Electron 42 → 43 — newer Chromium, improved security; on macOS/Linux, frameless windows now use rounded corners by default

**Dependencies**

- Upgraded `react-resizable-panels` 3 → 4 — fully migrated to the v4 API (`Group`/`Separator` components, percentage-based sizes, `usePanelRef`, keyed layout persistence); double-clicking a separator now resets the adjacent panel to its default size
- Migrated `@earendil-works/pi-ai` 0.79 → 0.80 — adopted the new provider-instance API (`getBuiltinModel`, `builtinModels`) replacing the removed standalone functions
- Updated `@anthropic-ai/claude-agent-sdk`, Radix UI primitives, Tailwind CSS 4.3.2, `@xterm` addons, `@tanstack/react-virtual`, Shiki, Mermaid, Sharp, `@electron/rebuild`, and other safe patch/minor packages

---

## [1.10.2] — 2026-07-01

Bug fixes: file mentions with spaces in their names now highlight correctly, and agent retry handles partial progress gracefully.

### Fixed

**File mentions**

- Mentioning a file or folder whose name contains spaces (e.g. `@My Document.txt`) now highlights the full path in the input and renders a correct chip in the sent message; previously only the text up to the first space was recognised
- The main-process mention parser and the in-app renderer both strip the backtick quoting used internally, so file content is correctly injected into the agent prompt

**Agent retry**

- Clicking Retry on an immediately-failed turn no longer flashes the chat to an empty state while disk I/O completes; the UI transitions directly from the error state to the new streaming response
- When an error occurs mid-turn after the agent has already completed tool calls, Retry now preserves the completed work in the transcript and sends a continuation prompt instead of replaying the original message from scratch

---

## [1.10.1] — 2026-06-26

Bug fixes — corrects Copilot vision detection and refreshes the affected model cache.

### Fixed

**Copilot vision**

- Removed an incorrect client-side heuristic that was marking all Copilot models as vision-capable; Copilot vision is a plan-level account setting controlled by GitHub, not a per-model capability
- Added a storage migration (v3 → v4) that resets the model cache for every Copilot connection, forcing a fresh API fetch on next boot so corrected vision flags are persisted
- Added `supportsVision` to the model equality check so stale cached models are replaced when the API returns updated data
- Replaced the "Vision" badge in the model picker with Eye / EyeOff icons shown for every model (including the active model in the trigger), making vision status always visible at a glance

---

## [1.10.0] — 2026-06-23

Auto-compaction visibility in the context badge, plus telemetry and token-accounting fixes.

### Added

**Auto-compaction threshold in the context badge**

- The context badge now shows the auto-compaction threshold, so you can see at a glance how much context headroom
  remains before the conversation is automatically compacted

### Changed

- The context-limit error message now explains that auto-compaction kicks in, making it clearer what happens as a
  conversation approaches the model's context window

### Fixed

**Telemetry (OpenTelemetry)**

- Sub-agent span files are now isolated per process id, preventing concurrent runs from corrupting each other's traces
- In-flight spans are flushed on exit and standalone completions are traced, so telemetry no longer drops the final
  spans of a session

**Context sizing & token usage**

- Pi-AI token fields are now mapped to the usage model so context sizing reflects real token counts
- Turn completion is now deferred until post-`agent_end` compaction settles, so usage and context state are reported
  accurately after an automatic compaction

---

## [1.9.0] — 2026-06-23

MCP extensions on the Pi backend, smarter image handling on non-vision models, and autonomy as an enforced risk budget.

### Added

**MCP extensions on the Pi backend**

- MCP-backed extensions now connect on Pi sessions too, not just Anthropic-backed ones. Servers connect in parallel with
  per-server and global timeouts so a failed server is skipped instead of blocking the session, live per-server
  connection status is shown on panel badges, and the model is told when a server is inactive so it won't call tools
  that aren't available

**Images on non-vision models**

- Image attachments are no longer rejected when the active model lacks vision support. They stay in the draft (and are
  restored when you switch models), shown struck-through with an inline notice and excluded from sending — matching VS
  Code's behaviour. Switching to a vision-capable model mid-conversation re-includes them

**Vision badge in the model picker**

- Vision-capable models are now marked with a dedicated badge in the model picker, making them easier to spot at a
  glance

### Changed

**Autonomy is now an enforced risk budget**

- Your autonomy level is now a real guarantee enforced in code rather than a prompt hint: the agent acts on its own when
  an operation's risk is below your level and only engages at or above it. A below-budget approval in auto mode is
  auto-approved without prompting, an irreversible floor always confirms destructive operations even at 100% autonomy,
  and collaboration dialogs gain a "Discuss first" option so you can talk before committing

---

## [1.8.0] — 2026-06-21

Quality of life improvements — search your sessions at a glance.

### Added

**Sessions search**

- The sessions panel now has a search mode that filters your sessions by title and working directory, with a dedicated
  search header, escape-to-close, and a context-aware empty state when nothing matches

---

## [1.7.0] — 2026-06-19

Live model-catalog refresh so your provider model lists stay current.

### Added

**Model catalog refresh**

- Each connection's model list is now treated as a cache that refreshes itself as providers add and retire models,
  rather than a fixed snapshot taken once. Refreshes run on startup, on use, and on demand via a new manual "Refresh
  models" action in AI settings, and open model pickers and settings update live when the catalog changes

---

## [1.6.1] — 2026-06-19

Bug fixes.

### Fixed

**Plan mode**

- Approving a risky operation, tool use, or non-safe phase while in plan mode no longer leaves the agent stuck — saying
  yes now promotes the session to auto so the next write actually goes through

---

## [1.6.0] — 2026-06-19

Opt-in OpenTelemetry tracing, branched-session quality of life, and a planning fix.

### Added

**OpenTelemetry tracing**

- Optionally emit OTel spans for agent turns, model requests, and tool calls — off by default, enabled from Settings →
  Telemetry. Spans follow the GenAI semantic conventions for compatibility with GenAI-aware backends, prompt/response
  content is gated behind a capture-content toggle (default off), secrets are never recorded, and per-user attribution
  rides on the OTel resource. Paths use `~` expansion and anchor relative output files under your home directory for
  predictable locations

**Branched sessions**

- Attachments from a message now travel with its text into a branched session's composer instead of being dropped

### Fixed

**Planning**

- Phase progress reporting after a plan revision no longer targets already-completed phases — revised phase lists now
  use absolute, continuous indices

---

## [1.5.0] — 2026-06-09

Agent session scratch directory for cleaner project output, plus Mermaid rendering fixes.

### Added

**Session scratch directory**

- Agents now have a dedicated per-session scratch directory for notes, throwaway scripts, and intermediate files,
  keeping your project and git status clean while deliverables still land in your project

### Fixed

**Mermaid diagrams**

- Valid diagrams are no longer rewritten unnecessarily, eliminating false-positive repairs on correct source
- Nested same-character braces (e.g. a `{{var}}` placeholder inside a `{decision}` node) no longer truncate node labels

---

## [1.4.0] — 2026-06-05

OpenAI-compatible provider support plus broad security hardening across the renderer, IPC, and agent tools.

### Added

**OpenAI-compatible providers**

- Connect to any OpenAI-compatible endpoint as a custom provider, with models discovered automatically from its
  `/v1/models` route

### Changed

**Security hardening**

- Renderer is hardened against XSS→IPC remote-code-execution chains, and filesystem and terminal access is now confined
  to known project roots
- `git:diff` file reads are restricted to allowed roots, and git commands run via `execFile` to prevent shell injection
- Agent `web_fetch` and `web_search` now block SSRF attempts
- At-rest secret files are written with owner-only permissions
- Untrusted model HTML is sanitized in session exports

### Fixed

**Models**

- Inheriting a session's model no longer triggers a spurious validation error

---

## [1.3.0] — 2026-06-05

Session export with shareable links, copy-to-clipboard actions throughout the UI, and a chat rendering fix.

### Added

**Session export**

- Export a session to HTML straight from the chat header — save it locally via a native dialog, or publish it as an
  ephemeral share link with a configurable expiry that you can revoke at any time

**Copy to clipboard**

- Copy buttons now appear on tool input/result blocks, diff views, error frames, and snippet previews for grabbing text
  in one click
- Rendered images in the file viewer and lightbox can be copied straight to the clipboard, re-encoded to PNG so they
  paste anywhere

### Fixed

**Chat**

- Embedded code blocks now render correctly when nested without their own outer chrome

---

## [1.2.2] — 2026-06-03

Bug fixes across the diff viewer and session management.

### Fixed

**Diff viewer**

- Line additions and deletions are now counted accurately using a proper Myers diff instead of naive line totals
- Corrected diff and modal pane sizing and overflow behavior

**Sessions**

- The "New session" draft (mode, autonomy, working directory, connection) is now preserved when switching between
  session slots instead of resetting

---

## [1.2.1] — 2026-06-02

Bug fixes for the file explorer and autonomy slider.

### Fixed

**File Explorer**

- Large directories no longer stall the tree — child folders now load on demand as they're expanded, and searching walks
  the full project depth so deeply nested files (and dotfolders) show up in results

**Autonomy**

- The in-session autonomy slider value now persists when starting a fresh chat instead of snapping back to the project
  or global default

---

## [1.2.0] — 2026-06-02

Expanded model and provider support via pi runtime upgrade; security hardening and UI polish.

### Added

**Models & Providers**

- New selectable models on GitHub Copilot including `claude-opus-4.8` (fixes a previously reported model resolution
  error), `gpt-5.5`, `gpt-5.4-mini`, `gemini-3.5-flash`, `gemini-3.1-pro-preview`, and `grok-code-fast-1`
- New providers exposed in the model picker: Together AI, Moonshot, Cloudflare AI Gateway, DeepSeek, and Fireworks

### Changed

**Plan progress**

- Replaced the pulsing block with a spinner on the active phase in `PhaseCard` for a clearer in-progress indicator

### Fixed

**Security**

- Blocked dangerous URL schemes (e.g. `file:`, `javascript:`) from agent-generated links in markdown, terminal output,
  and top-frame navigations — all renderer-initiated external URLs now flow through a shared classifier before reaching
  the OS protocol handler, closing RCE-class escape routes

---

## [1.1.0] — 2026-06-02

Planning workflow enhancements, file explorer panel, and Git UI improvements.

### Added

**Planning**

- Phase-level approval workflow with autonomy controls — users can now configure when phases require approval based on
  risk level and autonomy settings

**File Explorer**

- Collapsible file tree panel with virtual scrolling for improved navigation and performance with large directories

**Git Integration**

- Per-repo branch labels and collapsible file sections in Git views for better repository organization

### Changed

- File explorer now uses virtual scrolling and persistent state for better performance

### Fixed

**Planning**

- Fixed permission context not updating when switching from plan to auto mode
- Fixed accidental dismissal of approval dialogs

**Chat**

- Fixed CWD and permission settings not persisting in draft state
- Fixed active plan anchors sync and terminal plan anchor preservation
- Fixed plan anchor resolver recursive shadowing issue
- Fixed steer injection order during live assistant stream

---

## [1.0.1] — 2026-06-01

Bug fixes and stability improvements.

### Changed

- Removed broken SDD subsystem and associated prompt hooks

### Fixed

**Planning workflow**

- Fixed IPC event leakage across sessions — planning events now properly scoped to originating session and pinned to
  messages

**Project settings**

- Fixed project-level autonomy and model defaults not being applied to new sessions

---

## [1.0.0] — 2026-06-01

Adds multi-phase planning workflow, AI Credits billing support, parallel agent execution with worktree isolation, and
HTML previews.

### Added

**Planning workflow**

- Multi-phase execution planning workflow with approval system and user controls — the agent can now break down complex
  tasks into phases, present them for review, and execute with explicit user approval between phases

**Agent system**

- Git worktree isolation for parallel agents — sub-agents now execute in dedicated worktrees, enabling true concurrent
  execution without resource contention or file-system conflicts
- Cached agents awareness block in system prompt assembly for improved performance

**Billing & quota**

- AI Credits billing support (June 1, 2026) with Enterprise account detection and improved messaging

**Previews**

- HTML preview with sandboxed iframe for written files and search results

**Commit workflow**

- User-provided context for commit message generation — supply custom context to guide the AI when generating commit
  messages

### Changed

- Streamlined directives and refined collaboration guidance for agent delegation
- Unified permission model to intelligent autonomy-based collaboration

### Fixed

- Session recreation on token refresh when baseUrl changes
- Mermaid template syntax breaking on curly braces
- Billing error messages made provider-agnostic

---

## [0.19.0] — 2026-05-27

Quality of life improvements for session management.

### Added

**Session management**

- Draft state now clears automatically when starting a fresh session, preventing stale text and attachments from
  carrying over from previous sessions

---

## [0.18.0] — 2026-05-27

Adds global agent management and richer chat workflow visibility, plus model-picker improvements and targeted bug fixes.

### Added

**Agent system**

- Added a global agent registry with IPC wiring and a dedicated management UI, making configured agents available
  app-wide

**Chat**

- Chat now surfaces nested subagent progress and transcript events so multi-agent runs are easier to follow in real time
- Image attachments are now validated against model capabilities before send, preventing unsupported uploads

**Models**

- Copilot model selection now supports curated filtering and capability-based recommendations
- Live OAuth model availability is now tracked and persisted in the model dropdown

### Changed

**Editor**

- Monaco semantic features are now disabled when language workers are unavailable, reducing editor noise in unsupported
  contexts

### Fixed

**Chat & rendering**

- `Cmd/Ctrl+G` git-diff shortcut is now scoped to the active chat view, preventing cross-view shortcut collisions
- Mermaid preprocessing now correctly handles `@` characters in diagram data

---

## [0.17.0] — 2026-05-25

Adds new-session draft persistence for mode, folder, and model; fixes terminal keyboard shortcuts broken in v0.16.0.

### Added

**Chat**

- Permission mode, working folder, and connection/model selection are now preserved when switching away from an unsaved
  new session and back — only text and attachments were previously saved

### Fixed

**Terminal**

- `Cmd+←/→` tab switching and `Cmd+Shift+↑/↓` panel resize shortcuts no longer silently fail when the terminal has
  keyboard focus (regression introduced by the auto-focus change in v0.16.0)

---

## [0.16.0] — 2026-05-25

Adds merge conflict detection and three-way resolution UI; terminal tab enhancements and UI focus fixes.

### Added

**Git**

- Merge conflicts are now detected automatically and surfaced with a three-way resolution UI — choose incoming, current,
  or manually edit the merged result

**Terminal**

- Tab titles automatically display the current folder name when the shell is at a prompt
- Double-click any terminal tab to rename it with a custom title that persists for that session

### Fixed

**Terminal**

- Terminal instances now auto-focus when mounted, preventing missed keystrokes after opening a new tab

**UI**

- Expanded modals (fullscreen code blocks) now receive focus immediately on open, enabling keyboard interaction without
  an extra click

---

## [0.15.0] — 2026-05-25

Adds persistent hunk-level staging state in the Git diff panel; selections survive restarts.

### Added

**Git**

- Hunk-level staging selections are now persisted and restored across sessions — partial stage state survives editor
  restarts

---

## [0.14.0] — 2026-05-25

Adds Claude OAuth usage badges in Settings and persistent attachment drafts across session switches.

### Added

**Settings**

- Claude OAuth connections now show a live usage badge in Settings — fetches current quota consumption and displays it
  alongside the connection row

**Chat**

- Attachment drafts (files, images, snippets) are now persisted per session and restored when switching back, so
  in-progress attachments are never lost mid-workflow

---

## [0.13.0] — 2026-05-24

Adds a Recent Files palette (Cmd+E); fixes reload shortcuts in production and a search hover highlight glitch.

### Added

- Recent Files palette (Cmd+E) — quickly reopen recently accessed files from anywhere in the app

### Fixed

- Reload shortcuts (Cmd+R / Cmd+Shift+R) are now blocked in production builds to prevent accidental state corruption
- Search hover highlight no longer fires without actual mouse movement

---

## [0.12.0] — 2026-05-24

Adds in-app terminal with search, conversation branching, new shortcuts, and performance improvements; quality of life
improvements and bug fixes.

### Added

**Terminal**

- Integrated xterm.js with node-pty for a full in-app terminal panel
- In-terminal search bar and copy-on-select support

**Sessions**

- Conversation branching — fork a new session from any user message in the history
- New-session draft row visibility is now persisted across session switches

**Chat**

- Turn duration displayed in each message bubble
- Written files now render with syntax highlighting instead of an empty diff block

**Git**

- Repo-level stage-all toggle added to the GitFileList panel

**Keyboard shortcuts**

- Cmd+Delete deletes the active session
- Cmd+S navigates to the sessions list; Cmd+, opens Settings

### Changed

- Diff viewer is now lazy-loaded and latin-only font subsets are used — reduces initial bundle load time
- Thinking block text size increased from `xs` to `sm` for improved readability

### Fixed

- Per-session message draft now saves and restores correctly when switching sessions
- Git diff panel shows a single-panel view for new and deleted files instead of a broken diff
- Expand modal no longer allows nav clicks to pass through while it is open
- Unresolved file paths in `@mentions` are surfaced as errors with a file/folder read directive

---

## [0.11.0] — 2026-05-23

Adds Search Everywhere, smart file viewer, Ollama support, git diff review, and turn summary cards; several model
management fixes.

### Added

**Search Everywhere**

- Double-tap Shift opens a unified Search Everywhere palette — search across file names and file contents in one place
- Bundled `@vscode/ripgrep` for fast content search; common build/dep directories are excluded from results
- Smart file viewer routes results to the right renderer automatically: Markdown, images, JSON, or syntax-highlighted
  code

**Git tooling**

- Git diff review modal (Cmd+G) — browse and review staged/unstaged diffs without leaving the app
- Turn summary card in chat shows net per-file diff counts after each agent turn
- Improved AI commit message quality and amend-context awareness

**Session management**

- Bulk session delete/archive — select multiple sessions and act on them at once

**Settings & models**

- Keyboard shortcut map added to Settings — browse every keybinding in one place
- Ollama (local model) connection support — add a local Ollama endpoint as a connection
- ChatGPT Plus models now loaded dynamically from the Pi SDK registry via IPC
- Dynamic provider identity in system prompt reflects the active connection

### Fixed

**Model management**

- ChatGPT Plus connection now filters to the officially supported model set
- Codex tier label corrected — reverted Pro-only messaging; Codex works on Plus with supported models
- `set_model` is now sent when the model changes in an existing Pi subprocess, keeping the backend in sync
- `piAuthProvider` from connection metadata is correctly passed into `runAgentChat`
- `openai-responses` models are filtered out of the Copilot connection model list

---

## [0.10.0] — 2026-05-20

Adds ChatGPT Plus (Codex) as a supported connection provider.

### Added

**ChatGPT Plus (Codex) connection**

- ChatGPT Plus (Codex) is now available as a connection type — add it from the Connections settings to use Codex models
  in your sessions

---

## [0.9.0] — 2026-05-20

Adds a native datatable renderer for code blocks; several bug fixes including session rename and regenerate-title
actions.

### Added

**Datatable code block renderer**

- ` ```datatable ` fenced blocks now render as an interactive table with an expand-to-fullscreen button and a
  copy-as-Markdown-table action

### Fixed

**Session actions**

- Rename: replaced `window.prompt` (disabled by Electron) with an inline input that auto-focuses in the row; Enter/blur
  saves, Escape cancels
- Regenerate title: now surfaces failures via an alert instead of silently doing nothing; shows a *"Regenerating
  title…"* placeholder while the LLM call is in-flight

**Datatable**

- Copy action now produces a Markdown table instead of raw JSON

**Errors**

- Added `context_window_exceeded` error code and wired `invalid_request` so context-limit failures are reported clearly

**SDD**

- Re-watch all entities in `watchCb` so a newly-created `specs/` directory is detected without requiring a restart (
  BUG-SDD-08)

### Changed

- Bumped `@mariozechner/pi-*` 0.72.1 → 0.73.1

---

## [0.8.4] — 2026-05-13

SDD bug fix: agent now uses absolute artifact paths, eliminating lookup failures in monorepo and nested workspace
layouts.

### Fixed

**SDD — subdirectory entity layouts (monorepo / multi-service workspaces)**

- When the SDD entity root is a subdirectory of the session cwd, the agent was resolving artifact paths relative to cwd
  instead of entity root, causing ENOENT errors and requiring trial-and-error file discovery. The `<sdd_context>` block
  now provides the absolute entity root, absolute feature path, and an explicit absolute path per existing artifact so
  the agent can read/write files without any search step.
- Phase action buttons (▶ Tasks, ▶ Plan, ▶ Implement, etc.) now embed absolute `@file` references to relevant artifacts
  in the composed message — e.g. clicking ▶ Tasks includes `@/abs/path/spec.md` and `@/abs/path/plan.md`, so the agent
  reads them before running the command.
- The coaching "Resuming" section previously directed the agent to `ls .specify/specs/` (legacy pre-speckit path).
  Updated to use the injected `Feature path` from `<sdd_context>` first, with `ls specs/` in entity root as the
  fallback.
- Full-context feature list (no feature pinned) now appends the absolute path per feature entry so the no-pin codepath
  is equally unambiguous.

---

## [0.8.3] — 2026-05-13

Bug fix: conversation context is now correctly restored after app reinstall or upgrade.

### Fixed

**Session resumption after reinstall / upgrade**

- Pi backend now resumes the previous conversation after an app restart instead of silently starting a new session. The
  root cause was `SessionManager.create()` being called with the session storage path as `cwd`, causing Pi to write
  session files to the wrong location and always begin fresh.
- Anthropic backend now logs a warning when a stored resume session ID has no matching transcript file, surfacing silent
  context-loss events that would otherwise go unnoticed.

---

## [0.8.2] — 2026-05-13

Bug fix: SDD mode enabled on a fresh chat reverted to off after the first message.

### Fixed

- SDD mode toggled on a new session (before the first message) was not persisted — on send, the newly created session
  was rehydrated without a saved `sddMode`, resetting it to off

---

## [0.8.1] — 2026-05-13

Bug fixes for SDD context injection on both Anthropic and Pi backends.

### Fixed

**SDD — Anthropic backend**

- `chatSessionId` was not forwarded to `runAnthropicChat`, so `buildSddPromptBlock` always received
  `sessionId = undefined` and returned empty — the SDD coaching block was never injected for Anthropic connections
- Phase action button (▶ Tasks, ▶ Plan, etc.) on the active/default feature silently did nothing in new sessions — the
  dedup ref in `MessageInput` was never reset between sessions, causing identical message strings to be skipped

**SDD — Pi backend**

- SDD system prompt was set once at subprocess init and never updated; the freshly-computed per-turn append was silently
  discarded on all subsequent turns. Fixed by threading `systemPromptAppend` through `MsgPrompt` and calling
  `resourceLoader.reload()` when the value changes
- First-turn race condition: `initSessionState` fires from a React `useEffect` after the chat turn IPC starts, so
  `getState(chatSessionId)` was null when the initial append was computed. The append is now re-computed after
  `handle.ready` to capture state that settled during the subprocess spawn window
- Lean `<sdd_context>` block omitted the feature directory path, forcing the AI to explore the repo to locate artifact
  files. `Feature dir` is now included so the AI reads/writes to the right path immediately

---

## [0.8.0] — 2026-05-13

SDD workspace panel improvements and bug fixes for modern SpecKit layouts.

### Added

**SDD workspace panel**

- The workspace panel button (PanelRight) is now always visible on new sessions — no need to send a message first before
  you can open the SDD panel and browse features

### Fixed

**SDD — modern SpecKit layout (`specs/` at repo root)**

- Features no longer show `▶ Constitution` when the constitution already exists. `scanFeatures()` was recomputing the
  constitution path relative to `specsDir`, resolving to `{root}/memory/constitution.md` (never exists), so every
  feature was stuck at the `constitution` phase
- File-system watcher now also watches `{root}/specs/` in addition to `.specify/`. Previously only `.specify/` was
  watched, so edits to `spec.md`, `plan.md`, and `tasks.md` in the modern layout never triggered a panel rescan
- Agent hint for feature overflow now correctly shows `ls specs/` instead of `ls .specify/specs/` (which is always empty
  in the modern layout)

---

## [0.7.1] — 2026-05-12

Bug fixes for SDD artifact viewing.

### Fixed

**SDD artifact viewer**

- Feature spec, plan, and task files now load correctly in the viewer for non-legacy SpecKit projects where artifacts
  live at `$repo_root/specs/` rather than inside `.specify/specs/`. Previously the IPC security guard only allowed reads
  from `.specify/`, causing the viewer to show "spec.md not found" even when the SDD panel phase badge was correct.

---

## [0.7.0] — 2026-05-08

New features: Mermaid copy button, per-project Co-Authored-By, Copilot capability indicator, and rich compaction UI.

### Added

**Mermaid diagrams**

- Copy button (copies raw Mermaid source) now appears on hover next to the Expand button in both the rendered view and
  the error/fallback view

**Projects**

- Projects can now override the global Co-Authored-By trailer preference — set _On_, _Off_, or _Use global default_ per
  project in Settings → Projects
- The project list row shows a Co-Author chip alongside the existing Mode and Connection chips

**Copilot connections**

- Connection picker now shows a "No subagents (Task tool)" indicator under each Copilot connection row, making the
  capability gap visible before drilling in
- Copilot model list shows an info callout explaining that the Task tool requires an Anthropic connection

**Compaction UI (Copilot / Pi-server connections)**

- Pi-server sessions (Copilot, Bedrock, etc.) now surface the same amber scissors divider and sparkles toast on context
  compaction that Claude SDK sessions already show
- Aborted compactions are silently skipped; manual vs. auto trigger is correctly mapped from Pi SDK events

---

## [0.6.1] — 2026-05-08

Bug fixes and stability improvements.

### Fixed

- Elapsed turn timer no longer resets to 0:00 when switching sessions mid-stream — the counter now counts from when the
  turn actually started, surviving any number of session switches

---

## [0.6.0] — 2026-05-08

Adds attachment support to mid-turn message injection; fixes Mermaid cylinder shapes failing to render.

### Added

**Attachments in mid-turn steer**

- Images, PDFs, text files, and snippets can now be attached when injecting a message into a running turn via the Steer
  button (⌘+Enter)
- The Paperclip button is no longer disabled while the agent is streaming
- Attached files appear in the ghost "Injected mid-turn" bubble so there is a visible record of what was sent
- Attachments are restored to the composer if the steer fails, matching the existing text restore behaviour

### Fixed

**Mermaid diagram rendering**

- Cylinder / database node shapes (`[("text\nmore")]`) were being mangled by the `preprocessMermaid` function, producing
  an unmatched inner quote that caused Mermaid to fall back to raw source. The preprocessor now correctly preserves
  `(…)` delimiters when converting `\n` to `<br/>`.

---

## [0.5.0] — 2026-05-08

Adds smart snippet attachments for large clipboard pastes.

### Added

**Smart snippet attachments**

- Large clipboard pastes (≥30 lines or ≥1 500 chars) are automatically converted into named snippet chips instead of
  flooding the composer
- Snippet chip shows a language badge and line count in the attachment strip
- Hover the chip for a popover preview of the first ~8 lines
- Click the chip to open a full edit modal — rename, edit content, or change the detected language
- Language auto-detection covers 16+ languages via a new pure-sync heuristic (`lib/language-detect.ts`)
- Snippet content is fully delivered to the AI: Anthropic backend receives a fenced code block; Pi backend prepends it
  to the prompt — previously text attachments were silently dropped
- Session Info panel: snippet and code-file entries now show a `FileCode` icon with accent colour and an inline
  toggle-preview instead of only a Finder reveal button

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
