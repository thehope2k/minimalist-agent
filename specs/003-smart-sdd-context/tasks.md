# Smart SDD Context — Tasks

## Phase: Implement

### T-1 · Data layer

- [x] T-001 Add `activeFeatureSlug: string | null` and `turnCount: number` to `SddSessionState` in `src/shared/sdd-types.ts`
- [x] T-001b Add `defaultFeatureSlug: string | null` to `SddEntity` in `src/shared/sdd-types.ts` (sourced from `.specify/feature.json` at scan time)
- [x] T-002 Add `activeFeatureSlug?: string | null` to `SessionMeta` in `src/main/storage/sessions.ts`; bump schema to v7 with migration comment
- [x] T-003 Add `setActiveFeature(sessionId, slug | null)` to `src/main/sdd/session-state.ts`; resolve `activeFeatureSlug = savedSessionSlug ?? activeEntity.defaultFeatureSlug ?? null` in `initState`; preserve `savedSessionSlug` (not resolved value) in `reinitPreservingManual`
- [x] T-003b Read `.specify/feature.json` in `src/main/sdd/scan.ts` per entity; parse `feature_directory` field and extract slug; populate `SddEntity.defaultFeatureSlug`

### T-2 · Main process — system prompt

- [x] T-004 Add `userMessage?: string` to `SystemPromptOptions` in `src/main/agent/system-prompt.ts` and thread it through to `buildSddPromptBlock`
- [x] T-005 Pass `userMessage: req.prompt` in `buildSystemPromptAppend` call in `src/main/agent/backends/anthropic.ts`
- [x] T-006 Pass `userMessage: req.prompt` in `buildSystemPromptAppend` call in `src/main/agent/backends/pi/agent.ts`
- [x] T-007 Rewrite `buildSddPromptBlock` in `src/main/sdd/system-prompt.ts`:
  - When `activeFeatureSlug` is set (or entity has exactly 1 feature): build lean `<sdd_context>` for that feature only
  - Lazy rules: inject full `## SDD Mode` block only when `turnCount === 0` OR `userMessage` contains an SDD keyword
  - Increment `state.turnCount` on every call

### T-3 · IPC — setActiveFeature

- [x] T-008 Add `ipcMain.handle('sdd:setActiveFeature', ...)` in `src/main/ipc.ts`: call `sddSetActiveFeature`, persist slug to `SessionMeta`, return updated state
- [x] T-009 Expose `sdd.setActiveFeature(sessionId, slug)` in `src/preload/index.ts`
- [x] T-010 Add `sdd.setActiveFeature` signature to `src/renderer/src/lib/electron.d.ts`

### T-4 · Renderer lib

- [x] T-011 Add `PHASE_COMMANDS: Record<SddPhase, string>` and `phaseActionMessage(feature): string` helper to `src/renderer/src/lib/sdd.ts`

### T-5 · Hook

- [x] T-012 Add `setActiveFeature(slug: string | null): Promise<void>` to `useSdd` hook in `src/renderer/src/hooks/useSdd.ts`; call `window.api.sdd.setActiveFeature` and update local state

### T-6 · UI — FeatureRow

- [x] T-013 Extend `FeatureRowProps` in `src/renderer/src/components/sdd/sdd-panel/types.ts`: add `isActive`, `isSingleFeature`, `onPin`, `onPhaseAction`
- [x] T-014 Update `FeatureRow.tsx`: add pin toggle button (hidden when `isSingleFeature`); add `▶ Start [Phase]` action button; replace phase label with `✅ Complete` when `phase === 'complete'`

### T-7 · UI — SddPanel wiring

- [x] T-015 Thread `activeFeatureSlug`, `onPin`, `onPhaseAction`, `onSendMessage` through `SddPanel.tsx` down to each `FeatureRow`

### T-8 · UI — SddWorkspacePanel

- [x] T-016 Add `onSendMessage: (text: string) => void` prop to `SddWorkspacePanel`; wire it through to `SddPanel` → `FeatureRow.onPhaseAction`

### T-9 · UI — SddPhaseBadge popover

- [x] T-017 Make `SddPhaseBadge` clickable: add `onPhaseAction?: (message: string) => void` prop, `useState(isOpen)`, `useRef` for popover; render absolute-positioned popover with feature name, phase, and `▶ Start [Phase]` button

### T-10 · ChatArea wiring

- [x] T-018 Pass `onSendMessage` from `ChatArea` into `SddWorkspacePanel`; implement it by setting `pendingMessage` state which prefills `MessageInput` (user reviews and presses Enter)

### T-11 · Typecheck & validation

- [x] T-019 Run `bun run typecheck` — fix all type errors introduced by the new fields and prop changes *(clean — 0 errors)*
- [ ] T-020 Manual smoke test:
  - Pin a feature → verify next agent turn's system prompt contains only that feature in `<sdd_context>`
  - Send a non-SDD message → verify `## SDD Mode` rules block is absent
  - Send a message containing "spec" → verify rules block is present
  - Click `▶ Start Plan` → verify pre-composed message appears in chat
  - Click phase badge → verify popover opens with correct phase and action button
  - Close session and re-open → verify pin is restored
