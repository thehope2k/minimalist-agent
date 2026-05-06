# Theme Engine — Technical Plan

## Stack Decision

| Concern | Choice | Reason |
|---|---|---|
| Token format | OKLCH CSS variables | Already used in `globals.css`; perceptually uniform |
| Storage | Electron `userData` dir | Survives app updates; not in project repo |
| Registry | Static JSON on GitHub Pages | No backend; community-maintained |
| Live preview | CSS variable injection via `document.documentElement.style` | Zero re-render |

## Architecture

```
ThemeRegistry (main process)
  ├── list()         → built-in + installed themes
  ├── install(url)   → fetch, validate schema, write to userData/themes/
  ├── activate(id)   → write to preferences
  └── delete(id)     → remove from userData/themes/

ThemeLoader (renderer, runs at startup)
  └── applyTokens(theme) → injects CSS vars onto :root

IPC: theme:list | theme:install | theme:activate | theme:delete
```

## Token Schema (v1)

```json
{
  "id": "dracula",
  "name": "Dracula",
  "author": "community",
  "version": "1.0.0",
  "tokens": {
    "--background": "oklch(0.18 0.02 280)",
    "--foreground": "oklch(0.95 0.01 280)",
    "--accent": "oklch(0.72 0.19 300)"
  }
}
```

## Trade-offs

- Static registry means no discovery UX beyond a curated list — acceptable for v1
- CSS-only sandbox is sufficient for v1; post-v1 could explore a sandboxed iframe
