# Implementation Plan: SDD Native UX

**Branch**: `001-sdd-native-ux` | **Date**: 2026-05-05 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `.specify/specs/001-sdd-native-ux/spec.md`

## Summary

Native SDD (Spec-Driven Development) integration for Minimalist Agent — two layers:
**(1) App UI**: workspace scanner that discovers all `.specify/` entities on session open,
auto-maps them to service folders via heuristics, stores the mapping in session memory,
and surfaces everything in a side panel with live artifact status badges, an interactive
spec viewer with checkbox toggling, a phase badge in the session header, and an SDD mode
toggle. **(2) Agent Behavior**: bundled SDD coaching skill auto-injected into the system
prompt when entities are found, plus per-turn phase-aware context (active entity, current
phase, artifact state).

---

## Technical Context

**Language/Version**: TypeScript 5, Node 22, Electron (renderer = React 18)
**Primary Dependencies**: Electron `fs` / `FSWatcher` (main), React + Tailwind v4 (renderer), `react-resizable-panels` (existing layout), `react-markdown` + `remark-gfm` (existing markdown)
**Storage**: Session-scoped in-memory only (no disk writes for mapping data). Session `session.json` extended for `sddMode` flag.
**Testing**: `bun run typecheck` (TypeScript strict); no new test infrastructure required for v1
**Target Platform**: Electron desktop — macOS, Windows, Linux
**Performance Goals**: Scan completes in <100ms for typical workspaces (3 levels, skip noise dirs); artifact file-watch events debounced to 200ms
**Constraints**: Zero project-level file writes for mapping; all SDD state is session-scoped; system prompt extension must not break the existing `getSystemPrompt` cache semantics
**Scale/Scope**: Typical workspace: 1–20 service folders, 1–5 `.specify/` entities, 1–30 features per entity

---

## Constitution Check

- **Principle I (Simplicity)**: Feature has a clear user need in the roadmap ✅. No scope creep — spec is bounded to the four roadmap Level 2 items plus agent behavior.
- **Principle II (Process Boundaries)**: All renderer↔main communication goes through new IPC channels in `ipc.ts` + `preload/index.ts` ✅. No direct `fs` calls from renderer.
- **Principle III (UI Primitives First)**: `Badge`, `IconButton`, `Toggle`, `Select` from `components/ui/` are used throughout. No new inline color literals. New panel components follow the token system.
- **Principle IV (Component Cohesion)**: All new components capped at ~250 lines. `SddPanel` is split into an orchestrator + `sdd-panel/` subdirectory per the established pattern.
- **Principle V (Spec-Driven)**: This plan is generated from a complete spec ✅. Tasks will be generated before implementation begins.

---

## Project Structure

### Documentation (this feature)

```text
.specify/specs/001-sdd-native-ux/
├── spec.md              ✅ complete
├── plan.md              ← this file
├── data-model.md        ← Phase 1 output
└── tasks.md             ← /speckit-tasks output (not created here)
```

### Source Code — New files

```text
src/main/sdd/
├── types.ts             ← SddEntity, SddFeature, SddMapping, SddSessionState
├── scan.ts              ← workspace scanner (walk, skip noise, find .specify/)
├── mapper.ts            ← auto-mapping heuristics (high/medium confidence)
├── watcher.ts           ← FSWatcher wrapper for artifact file changes
├── session-state.ts     ← per-session mapping store (in-memory Map<sessionId, …>)
├── artifact.ts          ← read artifact files, toggle task checkboxes
├── phase.ts             ← derive SDD phase from artifact set
├── system-prompt.ts     ← build SDD context block for prompt injection
├── bundled-skill.ts     ← SDD coaching content (string constant, mirrors @speckit SKILL.md)
└── wizard.ts            ← run `specify init`, detect existing entities

src/renderer/src/components/sdd/
├── SddPanel.tsx                  ← orchestrator (~200 lines)
├── SddPhaseBadge.tsx             ← session header badge
├── SddModeToggle.tsx             ← Auto/Off toggle (uses Toggle from ui/)
├── SddArtifactViewer.tsx         ← markdown viewer with interactive checkboxes
├── SddWizardDialog.tsx           ← new SDD project dialog
└── sdd-panel/
    ├── types.ts
    ├── EntityCard.tsx            ← per-entity block with role label
    ├── FeatureRow.tsx            ← feature name + artifact badges
    ├── ArtifactBadge.tsx         ← ✅/⏳ badge (uses Badge from ui/)
    ├── MappingControl.tsx        ← reassign dropdown (uses Select from ui/)
    └── UnassignedSection.tsx     ← orphaned entities / unassigned services

src/renderer/src/hooks/
└── useSdd.ts                     ← session SDD state + IPC calls

src/renderer/src/lib/
└── sdd.ts                        ← renderer-side SDD types + helpers
```

### Source Code — Modified files

```text
src/main/ipc.ts                   ← register sdd:* IPC handlers
src/main/agent/system-prompt.ts   ← inject SDD coaching + phase context
src/main/storage/sessions.ts      ← add sddMode to SessionMeta
src/preload/index.ts              ← expose sdd:* API to renderer
src/renderer/src/lib/electron.d.ts ← type sdd:* surface
src/renderer/src/components/layout/ChatArea.tsx      ← add SddPhaseBadge, SddModeToggle
src/renderer/src/components/layout/SessionsPanel.tsx ← conditionally show SddPanel
src/renderer/src/App.tsx          ← wire SddPanel into layout
```

---

## Architecture

### Main Process — SDD Module

```
session opens
      │
      ▼
sdd/scan.ts
  walkForSpecifyDirs(cwd, maxDepth=3, skipDirs)
  returns SddEntity[]
      │
      ▼
sdd/mapper.ts
  autoMap(entities, cwd)
  → high confidence:  entity.path inside service folder → SddMapping{confidence:'high'}
  → medium confidence: entity folder name ≈ service folder name → SddMapping{confidence:'medium'}
  → unassigned: no match
      │
      ▼
sdd/session-state.ts
  Map<sessionId, SddSessionState>  (in-memory, cleared on session delete)
  SddSessionState { entities, mappings, mode: 'auto'|'off' }
      │
      ▼
sdd/watcher.ts
  FSWatcher on each entity's .specify/specs/ subtree
  debounce 200ms → emit 'sdd:artifact-changed' to renderer via ipcMain.emit
      │
      ▼
sdd/system-prompt.ts
  buildSddPromptBlock(sessionId, cwd)
  → if mode=off or no entities: ''
  → else: bundledSkillContent + phaseContextBlock
  called from buildSystemPromptAppend() on every turn
```

### IPC Surface

```
sdd:scan(cwd: string)
  → SddEntity[]

sdd:getSessionState(sessionId: string)
  → SddSessionState | null

sdd:setMapping(sessionId: string, mapping: SddMappingPatch)
  → void

sdd:setMode(sessionId: string, mode: 'auto' | 'off')
  → void

sdd:readArtifact(absolutePath: string)
  → string   (file content)

sdd:toggleTaskCheckbox(absolutePath: string, checkboxIndex: number)
  → void   (flips [ ] ↔ [x] at nth checkbox occurrence in file)

sdd:runInit(targetDir: string)
  → { success: boolean; error?: string }

sdd:onArtifactChanged
  → IPC event pushed from main to renderer when watcher fires
```

### Session Prompt Extension

```typescript
// system-prompt.ts — existing buildSystemPromptAppend extended:
export function buildSystemPromptAppend(input: {
  cwd?: string;
  includeCoAuthoredBy?: boolean;
  sessionId?: string;          // ← new optional field
}): string {
  const base = getSystemPrompt({ ... });
  const sdd = buildSddPromptBlock(input.sessionId, input.cwd);  // ← new
  return sdd ? `${base}\n\n${sdd}` : base;
}
```

The `buildSddPromptBlock` reads from `sdd/session-state.ts` (in-memory) and is fast. It injects:
1. The bundled SDD coaching content (from `bundled-skill.ts`)
2. A compact current-state block: active entity path, current phase, existing artifacts

### SddMode toggle in SessionMeta

```typescript
// sessions.ts SessionMeta — new field:
sddMode?: 'auto' | 'off';   // undefined = 'auto' (backward compat)
```

Persisted to `session.json` so if the user closes and reopens a session, the Off choice is remembered.

---

## Data Model

See [data-model.md](./data-model.md).

---

## Complexity Tracking

No constitution violations. All additions follow existing patterns directly.

---

## Integration Points with Existing Code

| Existing module | How this feature integrates |
|---|---|
| `system-prompt.ts` `buildSystemPromptAppend` | Extended with optional `sessionId`; calls `buildSddPromptBlock` |
| `sessions.ts` `SessionMeta` | New `sddMode` field added with backward-compat default |
| `ipc.ts` | New `sdd:*` handlers registered in `registerIpcHandlers()` |
| `preload/index.ts` | New `sdd` namespace added to `window.api` |
| `layout/ChatArea.tsx` | `SddPhaseBadge` and `SddModeToggle` added to session header bar |
| `layout/SessionsPanel.tsx` | `SddPanel` shown below session list when entities exist |
| `system-prompt.ts` `EXCLUDED_DIRECTORIES` | Reused as the skip-list for the SDD scanner |
| `system-prompt.ts` `walkForContextFiles` | Pattern reused (not shared) for `sdd/scan.ts` walk logic |
| File watcher pattern | Follows same invalidation pattern as `contextFileCache` TTL |
