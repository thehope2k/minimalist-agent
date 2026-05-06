# Tasks: SDD Native UX

**Input**: Design documents from `.specify/specs/001-sdd-native-ux/`
**Prerequisites**: spec.md ✅, plan.md ✅, data-model.md ✅

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to

---

## Phase 1: Setup (Module Skeleton)

**Purpose**: Create the new `sdd/` module structure and shared types so all parallel work in Phase 2 has a stable foundation.

- [x] T001 Create `src/main/sdd/types.ts` — define `SddEntity`, `SddFeature`, `SddArtifactSet`, `SddPhase`, `SddMapping`, `SddMappingPatch`, `SddSessionState` from data-model.md
- [x] T002 Create `src/renderer/src/lib/sdd.ts` — renderer-side re-exports of shared types plus `phaseLabel()`, `phaseNext()`, `artifactBadges()` helpers
- [x] T003 Create `src/renderer/src/components/sdd/sdd-panel/types.ts` — renderer-local panel types (`ArtifactBadge`, `EntityCardProps`, `FeatureRowProps`)

---

## Phase 2: Foundational (Main Process SDD Core)

**Purpose**: Core main-process logic that ALL user stories depend on. Must be complete before IPC or renderer work begins.

**⚠️ CRITICAL**: No user story implementation can begin until this phase is complete.

- [x] T004 Create `src/main/sdd/phase.ts` — implement `deriveSddPhase(artifacts: SddArtifactSet): SddPhase` using the logic from data-model.md; also `deriveEntityPhase(features: SddFeature[]): SddPhase` (lowest phase across features)
- [x] T005 [P] Create `src/main/sdd/scan.ts` — implement `scanForEntities(cwd: string, maxDepth?: number): SddEntity[]`: walk directory tree (max 3 levels), skip `EXCLUDED_DIRECTORIES` from `system-prompt.ts`, find `.specify/` dirs, populate `SddEntity` with features and artifact flags; infer entity role per data-model.md rules
- [x] T006 [P] Create `src/main/sdd/mapper.ts` — implement `autoMap(entities: SddEntity[], cwd: string): { mappings: SddMapping[]; unmappedServices: string[]; unmappedEntities: string[] }` using high/medium confidence heuristics from data-model.md; include single-entity shortcut (skip mapping UI when count = 1)
- [x] T007 [P] Create `src/main/sdd/session-state.ts` — implement in-memory `Map<sessionId, SddSessionState>`, export `getState()`, `setState()`, `patchMapping()`, `setMode()`, `clearState()` (called on session delete); no disk writes
- [x] T008 [P] Create `src/main/sdd/artifact.ts` — implement `readArtifact(absolutePath: string): string`, `toggleTaskCheckbox(absolutePath: string, checkboxIndex: number): void` (finds nth `[ ]` or `[x]` occurrence and flips it), `countCheckboxes(content: string): { total: number; checked: number }`
- [x] T009 [P] Create `src/main/sdd/watcher.ts` — implement `watchEntity(entity: SddEntity, onChange: () => void): FSWatcher`, `unwatchAll(): void`; debounce change events to 200ms; watch `.specify/specs/` subtree of each entity
- [x] T010 [P] Create `src/main/sdd/bundled-skill.ts` — export `BUNDLED_SDD_SKILL: string` constant containing the SDD coaching content (copy from `/Users/thehope/Library/Application Support/Minimalist Agent/skills/speckit/SKILL.md` body, strip YAML frontmatter)
- [x] T011 Create `src/main/sdd/system-prompt.ts` — implement `buildSddPromptBlock(sessionId: string, cwd?: string): string`: returns `''` if mode=off or no entities; otherwise returns bundled skill + compact phase-context block (active entity name, current phase, existing artifact list)
- [x] T012 Extend `src/main/agent/system-prompt.ts` `buildSystemPromptAppend()` to accept optional `sessionId?: string` and call `buildSddPromptBlock(sessionId, cwd)` — append result after base prompt when non-empty
- [x] T013 Extend `src/main/storage/sessions.ts` `SessionMeta` with optional `sddMode?: 'auto' | 'off'` field; add migration (index 6 in migrations array); update `createSession()` to accept `sddMode` in opts

**Checkpoint**: All main-process SDD logic exists and is unit-testable. No IPC or renderer work yet.

---

## Phase 3: US-1 — Browse SDD Features & Track Artifact Progress (P1) 🎯 MVP

**Goal**: Side panel lists all discovered entities and their feature artifact status. Auto-mapping runs at session open. Zero user configuration required.

**Independent Test**: Open any project with `.specify/` anywhere in its tree. SDD panel appears and shows correct ✅/⏳ badges without any user action.

- [x] T014 [US1] Add `sdd:*` IPC handlers to `src/main/ipc.ts`: `sdd:scan(cwd)`, `sdd:getSessionState(sessionId)`, `sdd:setMapping(sessionId, patch)`, `sdd:setMode(sessionId, mode)`, `sdd:readArtifact(path)`, `sdd:toggleTaskCheckbox(path, index)`, `sdd:runInit(targetDir)` — wire to the `src/main/sdd/` functions; register watcher onChange to push `sdd:artifact-changed` event to renderer via `webContents.send`
- [x] T015 [US1] Expose `sdd` namespace in `src/preload/index.ts`: `scan`, `getSessionState`, `setMapping`, `setMode`, `readArtifact`, `toggleTaskCheckbox`, `runInit`, `onArtifactChanged` — follow existing IPC bridge pattern
- [x] T016 [US1] Add `sdd` types to `src/renderer/src/lib/electron.d.ts` — type all `window.api.sdd.*` methods with correct input/output shapes from `types.ts`
- [x] T017 [US1] Create `src/renderer/src/hooks/useSdd.ts` — `useSdd(sessionId, cwd)` hook: calls `sdd:scan` + `sdd:getSessionState` on mount and cwd change; subscribes to `sdd:artifact-changed`; exposes `state`, `setMapping`, `setMode`, `refreshScan`
- [x] T018 [P] [US1] Create `src/renderer/src/components/sdd/sdd-panel/ArtifactBadge.tsx` — renders single ✅/⏳ pill using `Badge` from `components/ui/`; props: `{ label: string; done: boolean }`
- [x] T019 [P] [US1] Create `src/renderer/src/components/sdd/sdd-panel/FeatureRow.tsx` — renders feature name + row of four `ArtifactBadge` (spec/plan/tasks/impl); props: `{ feature: SddFeature; onOpen: () => void }`
- [x] T020 [P] [US1] Create `src/renderer/src/components/sdd/sdd-panel/EntityCard.tsx` — renders entity name, role label, mapped service badge, and list of `FeatureRow`; props: `{ entity: SddEntity; mapping?: SddMapping }`
- [x] T021 [P] [US1] Create `src/renderer/src/components/sdd/sdd-panel/UnassignedSection.tsx` — renders "Unassigned" section for entities and service folders with no mapping; uses `Badge` and `IconButton` from `components/ui/`
- [x] T022 [US1] Create `src/renderer/src/components/sdd/SddPanel.tsx` — orchestrator (~200 lines): uses `useSdd`; renders list of `EntityCard` + `UnassignedSection` + re-scan button; shows onboarding empty state when no entities found; conditionally renders mapping UI only when >1 entity exists
- [x] T023 [US1] Wire `SddPanel` into layout: `src/renderer/src/components/layout/SessionsPanel.tsx` or `App.tsx` as a collapsible section below session list, shown only when `state.entities.length > 0` or SDD mode is Auto; follow `react-resizable-panels` pattern from existing layout

**Checkpoint**: Panel visible with correct data. US-1 independently testable.

---

## Phase 4: US-2 + US-6 — Phase Badge & Auto-inject Bundled Skill (P2)

**Goal**: Session header shows current SDD phase. Agent auto-operates in SDD mode when entities found — no @speckit invocation needed.

**Independent Test US-2**: Open session on project with spec.md but no plan.md → header badge reads "Plan". No config required.
**Independent Test US-6**: On clean MA install, open SDD project, send any message → agent response references SDD phases without user typing @speckit.

- [x] T024 [US2] Create `src/renderer/src/components/sdd/SddPhaseBadge.tsx` — reads active entity's current phase from `useSdd` state; renders a `Badge` in the session header showing phase label + next action; hidden when no active entity or SDD mode is Off
- [x] T025 [US2] Add `SddPhaseBadge` to `src/renderer/src/components/layout/ChatArea.tsx` session header bar — position alongside existing `ContextBadge`; uses `useSdd` hook already provided by parent or instantiated locally
- [x] T026 [US6] Update `src/main/agent/backends/anthropic.ts` to pass `sessionId` into `buildSystemPromptAppend()` call — ensures SDD context is injected per-turn for Anthropic backend
- [x] T027 [US6] Update `src/main/agent/backends/pi/agent.ts` to pass `sessionId` into system prompt construction — ensures SDD context is injected per-turn for Pi/Copilot backend
- [x] T028 [P] [US6] Add `sdd:scan` + `sdd:autoMap` call to session-open flow in `src/main/ipc.ts` `chat:send` handler — when mode=auto and no state exists for sessionId yet, run scan+map before sending; store result in session-state

**Checkpoint**: Phase badge visible in header. Agent coaching auto-active in SDD projects. US-2 and US-6 independently testable.

---

## Phase 5: US-3 + US-7 — Spec Viewer & Phase-Aware Agent Context (P3)

**Goal**: Clicking a feature opens a structured viewer with interactive task checkboxes. Agent gets injected with current artifact state each turn.

**Independent Test US-3**: Click tasks.md in panel → viewer renders checkboxes. Toggle one → file on disk updated within 500ms. Works even when .specify/ is outside session CWD.
**Independent Test US-7**: Open session on project with only spec.md. Ask "what next?" → agent responds "you're at the Plan phase" without user providing context.

- [x] T029 [US3] Create `src/renderer/src/components/sdd/SddArtifactViewer.tsx` — renders artifact file content as markdown; for `tasks.md`: intercepts checkbox rendering to make them interactive (onClick calls `sdd:toggleTaskCheckbox`); for `spec.md`: applies `.acceptance-scenarios` CSS class to Given/When/Then blocks for visual distinction; uses existing `Markdown` component from `chat/parts/markdown/Markdown.tsx` as base
- [x] T030 [US3] Add `onOpen` handler in `SddPanel` → `FeatureRow` click opens `SddArtifactViewer` in a modal or slide-over panel; reads artifact content via `sdd:readArtifact`; refreshes on `sdd:artifact-changed` event
- [x] T031 [US3] Add acceptance scenario block styling to `src/renderer/src/globals.css` — `.sdd-acceptance-block` with subtle background/border using existing design tokens (`bg-panel`, `border-border`); no new color literals
- [x] T032 [US7] Extend `src/main/sdd/system-prompt.ts` `buildSddPromptBlock()` to include the phase context block: current entity name, phase name, list of existing artifact file names, count of total/checked tasks — formatted as a compact `<sdd_context>` XML block appended after the bundled skill content

**Checkpoint**: Spec viewer functional. Task checkboxes update disk. Agent sees current SDD state each turn. US-3 and US-7 independently testable.

---

## Phase 6: US-9 + US-5 — SDD Mode Toggle & Mapping Correction UI (P5)

**Goal**: Users can disable SDD mode per-session. Users can correct wrong auto-mappings directly in the panel.

**Independent Test US-9**: Toggle SDD Off → panel and badge disappear immediately; next agent turn has no SDD framing.
**Independent Test US-5**: In panel, change mapping for service-b from wrong entity to correct one → panel immediately reflects correct features for service-b.

- [x] T033 [US9] Create `src/renderer/src/components/sdd/SddModeToggle.tsx` — Auto/Off `Toggle` from `components/ui/`; on change calls `sdd:setMode` and updates session meta via existing `sessions:updateMeta` IPC; shows non-blocking notice "SDD context updated — active on your next message" when toggled during active stream
- [x] T034 [US9] Add `SddModeToggle` to `src/renderer/src/components/layout/ChatArea.tsx` session controls bar — alongside `PermissionModeButton`; reads `sddMode` from session meta
- [x] T035 [US9] Guard scan trigger in `src/main/ipc.ts` `chat:send` — if `sddMode === 'off'` skip scan entirely; ensure `buildSddPromptBlock` returns `''` when mode is Off (already handled by session-state check in T011)
- [x] T036 [US5] Create `src/renderer/src/components/sdd/sdd-panel/MappingControl.tsx` — `Select` from `components/ui/` listing all discovered entity names; shown per-service row in `EntityCard`; on change calls `sdd:setMapping`; shows "(unassign)" option; hidden when single-entity shortcut applies
- [x] T037 [US5] Wire `MappingControl` into `EntityCard.tsx` — render it below the service-name line when multiple entities exist; update `SddPanel` to re-render on mapping change events

**Checkpoint**: SDD On/Off toggle functional. Mapping reassignment works. US-9 and US-5 independently testable.

---

## Phase 7: US-4 + US-8 — SDD Project Wizard & Zero-Setup Onboarding (P4/P5)

**Goal**: New SDD project via in-app wizard. First-time users guided through CLI install if missing.

**Independent Test US-4**: Click "New SDD Project", pick empty dir, confirm → `specify init` runs, new session opens, panel shows entity with zero features.
**Independent Test US-8**: No `specify` CLI on PATH → panel shows non-blocking notice with install command. Agent behavior still activates (FR-038 — CLI only needed for init).

- [x] T038 [US4] Create `src/main/sdd/wizard.ts` — `runSpecifyInit(targetDir: string): Promise<{ success: boolean; error?: string }>`: shells out `specify init . --integration claude` in targetDir; on failure returns error without leaving partial state; validates no existing `.specify/` before running (uses `scanForEntities` from scan.ts)
- [x] T039 [US4] Create `src/renderer/src/components/sdd/SddWizardDialog.tsx` — dialog with folder picker (uses existing `FolderPicker` from `chat/FolderPicker.tsx`); calls `sdd:runInit`; on success opens new session via existing `sessions:create` IPC and navigates to it; on error shows human-readable message with install command; warns if existing entity found
- [x] T040 [US4] Add "New SDD Project" button to `SddPanel.tsx` empty/onboarding state — visible when no entities found; opens `SddWizardDialog`
- [x] T041 [US8] Add CLI availability check to `src/main/sdd/scan.ts` `scanForEntities()` — after scan, if entities found but `specify` CLI not on PATH, attach `{ cliMissing: true, installCmd: string }` to scan result
- [x] T042 [US8] Render CLI-missing notice in `SddPanel.tsx` — non-blocking banner at panel top when `cliMissing=true`; shows `uv tool install specify-cli --from "git+https://github.com/github/spec-kit.git@v0.8.5"`; dismissable; does NOT block panel from showing entities

**Checkpoint**: Wizard functional. CLI-missing notice shown. US-4 and US-8 independently testable.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Live file-watch wiring, CWD-change reactivity, typecheck, final integration.

- [x] T043 Wire `watcher.ts` into IPC lifecycle in `src/main/ipc.ts` — start watching all entities after scan completes; stop watching on session delete (hook into existing session delete handler); restart on re-scan
- [x] T044 Handle CWD change reactivity in `src/main/ipc.ts` — when `sessions:updateMeta` changes `workingDirectory`, clear session SDD state and re-scan; push `sdd:state-changed` event to renderer so `useSdd` hook refreshes panel + badge within 2 seconds (FR-013, FR-019)
- [x] T045 Add `sdd:artifact-changed` and `sdd:state-changed` event listeners to `useSdd.ts` — on receive, call `getSessionState` to refresh local state; trigger re-render of panel and badge
- [x] T046 Run `bun run typecheck` — fix all TypeScript errors across new and modified files
- [x] T047 Verify `EXCLUDED_DIRECTORIES` reuse — confirm `src/main/sdd/scan.ts` imports the same set from `system-prompt.ts` rather than redefining it; refactor to a shared constant in `src/main/agent/system-prompt.ts` if not already exported
- [x] T048 Verify constitution compliance — no new color literals, all new components use `bg-panel`/`text-fg`/`border-border` tokens; all new UI primitives barrel-exported from `components/ui/index.ts` if reusable; no component file exceeds 250 lines

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — blocks all user story phases
- **Phase 3 (US-1)**: Depends on Phase 2 — can begin once foundational complete
- **Phase 4 (US-2 + US-6)**: Depends on Phase 2 + Phase 3 (needs IPC + hook from Phase 3)
- **Phase 5 (US-3 + US-7)**: Depends on Phase 3 (needs panel + useSdd hook)
- **Phase 6 (US-9 + US-5)**: Depends on Phase 3 (needs panel)
- **Phase 7 (US-4 + US-8)**: Depends on Phase 2 (scan.ts) and Phase 3 (panel empty state)
- **Phase 8 (Polish)**: Depends on all prior phases

### Parallel Opportunities Per Phase

**Phase 2** — T005, T006, T007, T008, T009, T010 all touch different files → all parallel after T004

**Phase 3** — T018, T019, T020, T021 all touch different component files → parallel after T017

**Phase 4** — T026, T027, T028 touch different backend files → parallel

---

## Implementation Strategy

### MVP (Phase 1 + 2 + 3 only — ~23 tasks)

1. Phase 1: Types and module skeleton
2. Phase 2: Main-process SDD core
3. Phase 3: Panel, IPC, scan
4. **STOP**: Verify panel shows entities and artifact badges correctly
5. This alone delivers SC-001 and SC-002 from the spec

### Incremental Delivery

- After MVP: Add Phase 4 → phase badge + agent coaching
- After Phase 4: Add Phase 5 → spec viewer and agent context
- After Phase 5: Add Phase 6 + 7 → controls and onboarding
- Phase 8: Polish and ship

### Summary

| Phase | Tasks | Stories |
|---|---|---|
| 1 Setup | T001–T003 | — |
| 2 Foundational | T004–T013 | — |
| 3 US-1 Panel | T014–T023 | US-1 |
| 4 Badge + Skill | T024–T028 | US-2, US-6 |
| 5 Viewer + Context | T029–T032 | US-3, US-7 |
| 6 Toggle + Mapping | T033–T037 | US-9, US-5 |
| 7 Wizard + Setup | T038–T042 | US-4, US-8 |
| 8 Polish | T043–T048 | — |
| **Total** | **48 tasks** | **7 stories** |
