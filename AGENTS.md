# AGENTS.md

Guidance for any agent (human or AI) modifying this codebase.

## Agent worktree isolation

When multiple sub-agents run in parallel on the same project, each gets its own
**git worktree** for complete file isolation. This prevents resource contention
(Maven locks, npm locks, git operations, etc.).

### How it works

- Each agent execution creates a worktree at `.minimalist-agent/worktrees/<execId>/`
- The worktree branches from `origin/HEAD` (fresh checkout)
- Local config files are copied via `.worktreeinclude` patterns
- Worktree is cleaned up automatically if no changes were made
- Worktrees with changes/commits are kept for user review

### Configuration

Create `.worktreeinclude` in your project root to specify which local files
should be copied into agent worktrees:

```gitignore
# .worktreeinclude
.env
.env.local
.npmrc
.mvn/settings.xml
```

See `.worktreeinclude.example` for a full template.

**Important:** Only gitignored files are copied (safety check). Committed
files are already present in the worktree from git.

### Fallback behavior

If the project is not a git repository, agents run in the original working
directory (no isolation). This ensures the feature degrades gracefully.

### Limitations and Resource Contention

Git worktrees **only isolate file system paths**. They do NOT prevent:

- **System-wide package caches** — shared by all processes (e.g., `~/.m2/repository/`, `~/.npm/`, `~/.gradle/`, `~/.cargo/`, pip cache)
- **Port conflicts** — multiple processes binding the same port
- **Daemon/service locks** — Docker, databases, system services
- **Global lock files** — package managers coordinating across the system

**If you are a sub-agent running in parallel with others:**

1. **Before running builds or installs**, check if you actually need to — read existing build outputs, use offline/cached modes, or skip if another agent is handling it.
2. **Avoid starting servers** — don't run dev servers, databases, or anything that binds ports unless absolutely necessary.
3. **Use unique ports if required** — if you must run a server, allocate a random high port to avoid conflicts.
4. **Serialize heavy operations** — if another agent is clearly doing the same expensive task (building, installing dependencies), coordinate or wait.
5. **Prefer read-only operations** — focus on analysis, code generation, or reporting over builds/installs when possible.

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

## Dependencies

Packages used **only in the renderer** (React components, UI libs, syntax
highlighters, etc.) belong in `devDependencies`. Packages required by the
**main process at runtime** (node-pty, electron-updater, @mariozechner/\*,
sharp, …) belong in `dependencies`.

Reason: electron-builder packs every `dependency` into the app alongside the
already-bundled `out/renderer/`. Putting renderer libs in `dependencies` ships
them twice and bloats the installer by 200+ MB.

After editing `package.json` (even just moving between the two sections),
run `node scripts/rebuild-native.mjs` before `npm run dev` to ensure
`node-pty` is compiled against the correct Electron version.

## Process boundaries

- Renderer talks to main only via `window.api` (typed in `lib/electron.d.ts`).
- New IPC methods go in `src/main/ipc.ts` and `src/preload/index.ts`.
- The preload uses `contextBridge.exposeInMainWorld('api', api)` — do **not**
  drop the `treeshake: false` setting in `electron.vite.config.ts` for the
  preload build, or the side-effect call gets eliminated.

## Persistence

- Renderer-side storage goes in `src/renderer/src/lib/connections.ts` style:
  small modules with read/write helpers over `localStorage`.
- Secrets (API keys, OAuth tokens) are stored encrypted via Electron's
  `safeStorage` (OS keychain) in the main process. Never store credentials
  in `localStorage` — use the `credentials:set` IPC path instead.

## Comments

- Don't write comments that restate the code. Names should carry that.
- Do write a one-liner when the **why** is non-obvious (a workaround, a
  constraint, a license note, a deliberate non-feature).
