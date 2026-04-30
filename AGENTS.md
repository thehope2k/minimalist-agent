# AGENTS.md

Guidance for any agent (human or AI) modifying this codebase.

## Shared UI components

We have a small in-house UI library at `src/renderer/src/components/ui/`:

- `Badge` — pills like "Default", "Soon"
- `Button` — text button with `primary` / `outline` / `ghost` / `link` variants
- `IconButton` — square icon-only button
- `Input` / `Textarea` — form inputs (shared chrome via `FIELD_CHROME`)
- `Select` — styled `<select>` with chevron
- `Field` — label + child + optional hint
- `Toggle` — boolean switch
- `Resizable*` — panel primitives (wraps `react-resizable-panels`)

**Rule when adding new UI:**

1. **Before writing inline styles for a button / input / badge / dialog,**
   check `components/ui/`. If a primitive exists, use it.
2. **On the second identical inline pattern,** extract to `components/ui/`.
   Don't extract on the first; don't wait for the third.
3. **Match existing token usage** (`bg-panel`, `text-fg`, `text-fg-muted`,
   `text-fg-subtle`, `border-border`, etc.) — do not introduce new color
   literals or arbitrary hex.
4. **Don't recreate shadcn from scratch.** If a primitive is hard (Dialog with
   focus trap, Combobox), it's fine to add `npx shadcn-ui add <thing>` instead
   of hand-rolling. Note the addition in this file.
5. **Barrel export** new primitives from `components/ui/index.ts` so
   consumers can `import { X, Y } from '@/components/ui'`.

## Design tokens

Colors are defined in `src/renderer/src/globals.css` using OKLCH + `color-mix`.
Two base colors (`--background`, `--foreground`) plus an `--accent`; everything
else is derived. **Don't add new base colors without a strong reason** —
derive instead (`--elevated-2`, `--fg-muted`, …).

## Component file size

If a component file passes ~250 lines or starts doing more than two unrelated
jobs, **split it**. Pattern we already use:

```
ParentComponent.tsx              # orchestrator, ~50 lines
parent-flow/                     # subdirectory for the pieces
  ├── types.ts
  ├── shared.tsx                 # local helpers used by 2+ siblings
  ├── ChildA.tsx
  └── ChildB.tsx
```

See `components/settings/AddConnectionDialog.tsx` + `connection-flow/`.

## Process boundaries

- Renderer talks to main only via `window.api` (typed in `lib/electron.d.ts`).
- New IPC methods go in `src/main/ipc.ts` and `src/preload/index.ts`.
- The preload uses `contextBridge.exposeInMainWorld('api', api)` — do **not**
  drop the `treeshake: false` setting in `electron.vite.config.ts` for the
  preload build, or the side-effect call gets eliminated.

## Persistence

- Renderer-side storage goes in `src/renderer/src/lib/connections.ts` style:
  small modules with read/write helpers over `localStorage`.
- Secrets (API keys, OAuth tokens) **eventually** belong in Electron's
  `safeStorage` via IPC. Currently in `localStorage` for v1 — see
  `docs/LIMITATIONS.md`.

## Comments

- Don't write comments that restate the code. Names should carry that.
- Do write a one-liner when the **why** is non-obvious (a workaround, a
  constraint, a license note, a deliberate non-feature).
