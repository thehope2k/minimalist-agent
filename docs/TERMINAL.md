# Terminal (Cmd+T) — Implementation Spec

Full built-in terminal emulator using `xterm.js` + `node-pty`. Real PTY, persistent across
Cmd+T toggle, multiple tabs, global (not session-scoped).

---

## Architecture

```
Main process
  src/main/terminal/
    types.ts          — TerminalTabInfo
    manager.ts        — PTY lifecycle singleton, scrollback ring buffer, broadcast to renderer

IPC (ipc.ts + preload/index.ts)
  terminal:resolveShell  → string
  terminal:create        → TerminalTabInfo
  terminal:write         (tabId, data)
  terminal:resize        (tabId, cols, rows)
  terminal:getScrollback (tabId) → string | null
  terminal:listTabs      → TerminalTabInfo[]
  terminal:kill          (tabId)

  PUSH (main→renderer)
  terminal:data          { tabId, data }
  terminal:exit          { tabId, exitCode }
  terminal:titleChange   { tabId, title }

Renderer
  src/renderer/src/
    lib/terminal-settings.ts                     — localStorage prefs (shell, font, scrollback)
    components/terminal/
      TerminalPanel.tsx                          — orchestrator: tab bar + instances
      terminal-panel/
        types.ts                                 — TerminalTabState
        useTerminalManager.ts                    — tab state machine + IPC lifecycle
        TabBar.tsx                               — tab chips with +/× buttons
        TerminalInstance.tsx                     — xterm.js mount + IPC wiring
    components/settings/panels/TerminalPanel.tsx — settings UI
```

## Key design decisions

- **Global terminal** — not session-scoped. `initialCwd` seeds the first tab only.
- **Tabs are tab-aware from day 1** — all IPC parameterised by `tabId`.
- **Toggle = collapse, not unmount** — `TerminalInstance` stays mounted; ResizablePanel
  collapses to 0. PTY persists in main process regardless.
- **Scrollback** — 2 MB ring buffer per tab in main process; replayed via
  `terminal:getScrollback` when a TerminalInstance (re)mounts.
- **Dead tabs** — `terminal:exit` marks tab `alive=false`; tab stays open with
  `[exited]` suffix, no auto-close.
- **Keyboard shortcut** — Cmd+T (global), registered in App.tsx.
  Button lives in TopBar (not ChatArea — terminal is not session-scoped).
- **CWD threading** — ChatArea exposes `onCwdChange` prop; App.tsx stores it as
  `activeCwd`; passed to TerminalPanel as `initialCwd` for first-tab seeding.

## Build pipeline

- `node-pty` native C++ addon → external in Vite main build, asarUnpack in electron-builder.
- `@electron/rebuild` postinstall script rebuilds node-pty for the current Electron ABI.
- `@xterm/xterm` + addons → pure JS, bundled by Vite renderer build normally.

## Settings

Stored in localStorage (`terminal:settings-v1`):
- `shell`       string  — empty = auto-detect from `process.env.SHELL`
- `fontSize`    number  — default 13
- `fontFamily`  string  — default `'Menlo, Monaco, Consolas, monospace'`
- `scrollback`  number  — default 10000 lines
