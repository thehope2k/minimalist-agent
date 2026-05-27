# Terminal (Cmd+T)

Full built-in terminal emulator with real PTY support — runs interactive processes correctly (Node REPLs, Python shells, vim, etc.).

---

## Features

**Multiple tabs**
- `Cmd+Shift+T` — new tab
- `Cmd+←/→` — switch tabs
- `Cmd+Shift+W` — close tab
- Double-click tab to rename

**Panel control**
- `Cmd+T` — toggle panel open/close
- `Cmd+Shift+↑/↓` — resize panel (3% steps)
- Panel state persists across restarts

**Search & copy**
- `Cmd+F` — in-terminal search with live highlighting
- Copy-on-select (auto-copies selected text)
- Right-click context menu (Copy / Paste / Clear)
- `Cmd+K` — clear scrollback

**Smart features**
- Tab titles auto-show current folder when at shell prompt
- URL `Cmd+Click` opens in system browser
- 2 MB scrollback buffer per tab (persists when panel is closed)
- Initial CWD seeded from active session's working directory

---

## Settings

Open **Settings → Terminal** to configure:

- **Shell** — file picker or leave empty to auto-detect from `$SHELL`
- **Font family** — choose from three bundled monospace fonts (JetBrains Mono, Fira Code, Cascadia Code) or system fonts
- **Font size** — default 13px
- **Scrollback** — number of lines to keep in history (default 10,000)

---

## Architecture Notes

For contributors:

- Uses `xterm.js` (renderer) + `node-pty` (main process) for real PTY support
- Terminal state is global (not session-scoped)
- PTY processes persist in the main process even when the panel is collapsed
- Dead tabs stay open with `[exited]` suffix — no auto-close
- Scrollback is stored in-memory as a 2 MB ring buffer per tab

See `src/main/terminal/manager.ts` and `src/renderer/src/components/terminal/` for implementation details.
