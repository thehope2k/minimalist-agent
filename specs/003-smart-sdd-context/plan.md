# Technical Plan: Smart SDD Context

**Feature**: `003-smart-sdd-context`
**Created**: 2026-05-06

## Stack Decision

No new dependencies. All changes use existing patterns within the codebase.

| Concern | Choice | Reason |
|---|---|---|
| Active feature state | Hybrid: `SessionMeta` (session override) + `feature.json` (project default) | Session independence + CLI alignment |
| `feature.json` read | `scan.ts` → `SddEntity.defaultFeatureSlug` | Picks up CLI-set active feature automatically |
| Resolution order | `sessionMeta.activeFeatureSlug ?? entity.defaultFeatureSlug ?? null` | Session pin wins; falls back to CLI state |
| Turn count | `SddSessionState.turnCount` | Incremented in `buildSddPromptBlock`; resets on `initState` |
| Keyword detection | Plain `String.includes` loop | < 1ms; no regex overhead needed |
| Phase action message | IPC-free — renderer-side only | Message text built in `lib/sdd.ts`; sent via existing `onSend` prop chain |
| Phase badge popover | `useState` + `useRef` + absolute div | Scope is too small to justify shadcn `Popover`; no focus trap needed |
| Auto-detection (FR-017) | Deferred to post-v1 | Best-effort; core value is in manual pin |

## Architecture

### Data layer changes

```
src/shared/sdd-types.ts
  SddSessionState
    + activeFeatureSlug: string | null   ← resolved value (session pin ∨ feature.json default)
    + turnCount: number                  ← reset on initState
  SddEntity
    + defaultFeatureSlug: string | null  ← parsed from .specify/feature.json at scan time

src/main/storage/sessions.ts
  SessionMeta (v7)
    + activeFeatureSlug?: string | null  ← explicit user pin; null = use feature.json default
```

### Active feature resolution (in `initState`)

```typescript
// Priority: explicit session pin > feature.json default > null
const resolvedSlug = savedSessionSlug ?? activeEntity?.defaultFeatureSlug ?? null;
state.activeFeatureSlug = resolvedSlug;
```

This means:
- CLI runs `specify feature set 003` → writes `feature.json` → new sessions auto-start on `003`
- User pins `002` in MA → stored in `SessionMeta` → only that session is affected
- Existing sessions unaffected by CLI changes to `feature.json`

### Main process changes

```
src/main/sdd/scan.ts
  + read .specify/feature.json per entity after scanning features
  + parse feature_directory field → extract slug (basename of path)
  + populate SddEntity.defaultFeatureSlug

src/main/sdd/session-state.ts
  + setActiveFeature(sessionId, slug | null) → writes SessionMeta only, returns updated state
  · initState: resolve activeFeatureSlug = savedSessionSlug ?? activeEntity.defaultFeatureSlug ?? null
  · reinitPreservingManual: preserve savedSessionSlug (not resolved slug) across re-scans

src/main/sdd/system-prompt.ts  (buildSddPromptBlock)
  · if activeFeatureSlug set → build lean <sdd_context> (single feature)
  · lazy rules: inject full ## SDD Mode block only when:
      turnCount === 0  OR  message contains SDD keyword
  · increment state.turnCount on every call

src/main/ipc.ts
  + sdd:setActiveFeature(sessionId, slug | null)
      → sddSetActiveFeature(sessionId, slug)
      → persist to SessionMeta.activeFeatureSlug
      → return updated SddSessionState
```

### Preload + types

```
src/preload/index.ts
  + sdd.setActiveFeature(sessionId, slug | null)

src/renderer/src/lib/electron.d.ts
  + window.api.sdd.setActiveFeature(sessionId: string, slug: string | null)
      : Promise<SddSessionState | null>
```

### Renderer changes

```
src/renderer/src/lib/sdd.ts
  + phaseActionMessage(feature: SddFeature): string
      → builds pre-composed message string
  + PHASE_COMMANDS: Record<SddPhase, string>
      → maps phase → '/speckit.X' directive

src/renderer/src/hooks/useSdd.ts
  + setActiveFeature(slug: string | null): Promise<void>
      → calls window.api.sdd.setActiveFeature
      → updates local state

src/renderer/src/components/sdd/sdd-panel/types.ts
  FeatureRowProps
    + isActive: boolean
    + onPin: () => void
    + onPhaseAction: (message: string) => void

src/renderer/src/components/sdd/sdd-panel/FeatureRow.tsx
  · Add pin toggle button (pin icon; filled when isActive)
  · Add phase action button ("▶ Start [Phase]") — hidden when complete
  · Replace "Complete" phase label with "✅ Complete" badge when phase === 'complete'

src/renderer/src/components/sdd/SddPanel.tsx
  · Thread activeFeatureSlug, onPin, onPhaseAction down to FeatureRow

src/renderer/src/components/sdd/SddPhaseBadge.tsx
  · Wrap in <button> with onClick
  · useState(isOpen) + useRef(ref) for popover positioning
  · Popover: feature name, phase, "▶ Start [Phase]" button → calls onPhaseAction

src/renderer/src/components/layout/chat-area/SddWorkspacePanel.tsx
  + onSendMessage: (text: string) => void   ← new prop
  · Thread down to SddPanel → FeatureRow → onPhaseAction
```

### Message flow for phase action button

```
FeatureRow "▶ Start Plan" click
  → phaseActionMessage(feature)          [lib/sdd.ts — pure]
  → onPhaseAction(message)               [prop chain]
  → SddWorkspacePanel.onSendMessage      [prop]
  → ChatArea onSend({ prompt: message }) [existing send path]
  → ipc chat:send                        [existing IPC]
```

No new IPC needed for sending — the existing `onSend` path is reused.

### Lazy rules keyword list

```typescript
const SDD_KEYWORDS = [
  'specify', 'spec', 'plan', 'task', 'phase',
  'constitution', 'implement', 'artifact', 'speckit', '/speckit',
];
// Case-insensitive check against raw user message text.
```

The user message text is NOT available inside `buildSddPromptBlock` today.
**Solution**: pass it as an optional parameter from the backend call sites.

```typescript
// anthropic.ts / pi agent.ts
append: buildSystemPromptAppend({
  cwd: req.cwd,
  sessionId: req.chatSessionId,
  userMessage: req.prompt,        // ← new optional field
})

// system-prompt.ts: getSystemPrompt
export interface SystemPromptOptions {
  ...
  userMessage?: string;           // ← new optional field
}

// sdd/system-prompt.ts: buildSddPromptBlock
export function buildSddPromptBlock(
  sessionId: string | undefined,
  userMessage?: string,
): string
```

### `phaseActionMessage` helper

```typescript
const PHASE_COMMANDS: Record<SddPhase, string> = {
  constitution: '/speckit.constitution',
  specify:      '/speckit.specify',
  plan:         '/speckit.plan',
  tasks:        '/speckit.tasks',
  implement:    '/speckit.implement',
  complete:     '',   // no action
};

export function phaseActionMessage(feature: SddFeature): string {
  const cmd = PHASE_COMMANDS[feature.currentPhase];
  if (!cmd) return '';
  if (feature.currentPhase === 'implement') {
    const p = taskProgress(feature.artifacts);
    const progress = p ? ` (${p.checked}/${p.total} tasks done)` : '';
    return `Let's run ${cmd} for ${feature.name}${progress}.`;
  }
  return `Let's run ${cmd} for ${feature.name}.`;
}
```

### Single-feature implicit active (FR-015)

When `entity.features.length === 1`, treat that feature as implicitly active inside
`buildSddPromptBlock` — no UI pin needed, lazy injection applies automatically.
The pin button is hidden in `FeatureRow` when the entity has exactly one feature.

## File Change Summary

| File | Change type |
|---|---|
| `src/shared/sdd-types.ts` | Add `defaultFeatureSlug` to `SddEntity`; add 2 fields to `SddSessionState` |
| `src/main/sdd/scan.ts` | Read `feature.json` per entity, populate `defaultFeatureSlug` |
| `src/main/storage/sessions.ts` | Add `activeFeatureSlug` to `SessionMeta`, bump schema v7 |
| `src/main/sdd/session-state.ts` | Add `setActiveFeature()`, update `initState` |
| `src/main/sdd/system-prompt.ts` | Lean context + lazy rules logic |
| `src/main/agent/system-prompt.ts` | Add `userMessage?` to `SystemPromptOptions` |
| `src/main/agent/backends/anthropic.ts` | Pass `userMessage` to `buildSystemPromptAppend` |
| `src/main/agent/backends/pi/agent.ts` | Pass `userMessage` to `buildSystemPromptAppend` |
| `src/main/ipc.ts` | Add `sdd:setActiveFeature` handler |
| `src/preload/index.ts` | Expose `sdd.setActiveFeature` |
| `src/renderer/src/lib/electron.d.ts` | Type new IPC method |
| `src/renderer/src/lib/sdd.ts` | Add `phaseActionMessage`, `PHASE_COMMANDS` |
| `src/renderer/src/hooks/useSdd.ts` | Add `setActiveFeature` action |
| `src/renderer/src/components/sdd/sdd-panel/types.ts` | Extend `FeatureRowProps` |
| `src/renderer/src/components/sdd/sdd-panel/FeatureRow.tsx` | Pin + action buttons |
| `src/renderer/src/components/sdd/SddPanel.tsx` | Thread new props |
| `src/renderer/src/components/sdd/SddPhaseBadge.tsx` | Clickable + popover |
| `src/renderer/src/components/layout/chat-area/SddWorkspacePanel.tsx` | `onSendMessage` prop |

**17 files. No new dependencies. No new IPC for message sending.**

## Trade-offs

- **Keyword list is a heuristic** — a message like `"don't use tasks for this"` would
  trigger full rule injection. Acceptable: false positives are free (just extra tokens),
  false negatives mean a missing ruleset on one turn (recoverable by mentioning a keyword).
- **`userMessage` threaded through two backends** — minor coupling. The alternative
  (detecting keywords inside the renderer before sending) would require a renderer→IPC
  round-trip just to influence the system prompt, which is worse.
- **Phase badge popover is hand-rolled** — 30 lines of `useState` + absolute positioning.
  If it grows (e.g. needs keyboard nav), migrate to `shadcn-ui add popover` at that point.
- **Auto-detection deferred** — FR-017/018/019 (infer active feature from recent file
  changes) is intentionally out of scope for v1. Manual pin covers 100% of cases;
  auto-detection is a nice-to-have for v2.
