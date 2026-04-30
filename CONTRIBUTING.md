# Contributing

Thanks for your interest in contributing to Minimalist Agent.

## Development setup

**Prerequisites:** Node 22+, [Bun](https://bun.sh) (for install speed — `npm` works too)

```bash
git clone https://github.com/thehope2k/minimalist-agent.git
cd minimalist-agent
bun install        # or: npm install
bun run dev        # launch Electron in dev mode with HMR
```

## Scripts

| Command             | What it does                                               |
|---------------------|------------------------------------------------------------|
| `bun run dev`       | Launch Electron with Vite HMR — main + renderer hot-reload |
| `bun run build`     | Production build into `out/`                               |
| `bun run typecheck` | TypeScript check across main + renderer (no emit)          |
| `bun run pack`      | Build + package locally (no upload) → `release/`           |

## Project structure

```
src/
├── main/          Electron main process (agent, IPC, storage, OAuth)
├── preload/       Context-bridge IPC typed API
└── renderer/      React app
    └── src/
        ├── components/
        ├── hooks/
        └── lib/
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for a detailed breakdown of the agent pipeline.

## Code conventions

The full coding guide lives in [AGENTS.md](AGENTS.md). Key points:

- **UI primitives** — use `components/ui/` before writing inline styles.
- **IPC** — renderer talks to main only via `window.api`; new methods go in `src/main/ipc.ts` + `src/preload/index.ts`.
- **Comments** — don't restate the code; write a one-liner only when the *why* is non-obvious.
- **Component size** — split files that exceed ~250 lines into a parent + subdirectory.

## Pull requests

1. Fork → branch off `main`.
2. Make your changes; run `bun run typecheck` before pushing.
3. Open a PR with a clear description of *what* and *why*.
4. Small, focused PRs are preferred over large all-in-one changes.

## Reporting bugs

Open an issue at <https://github.com/thehope2k/minimalist-agent/issues>.  
Include your OS, app version (Help → About or window title bar), and steps to reproduce.
