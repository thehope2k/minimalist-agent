# Browser tool (`browser_tool`)

Lets the agent drive a real, visible Chromium window to check a running app, read a page, or fill in a form — one window
per chat session, owned and lifecycle-managed by the app.

---

## Why this exists

Minimalist Agent's only other web capability is `web_fetch`/`web_search` (static, read-only — see
`src/main/pi-server/web-tools.ts`). Neither can click, fill a form, or watch a page update. `browser_tool` fills that
gap with a small, first-party, embedded alternative to spawning an external browser-automation process (e.g. the
Playwright MCP extension), scoped specifically to this app's use case: check a locally-running app, not general
cross-browser test automation.

Full background and the build-vs-buy reasoning live in the chat history that produced this feature; the short version:

- The **Playwright MCP extension**, if the user has it installed and enabled, remains available independently of this
  tool — it's a separate, opt-in, user-managed capability with no coupling to `browser_tool`, and it's the better choice
  for anything cross-browser or storage/network-mock-heavy.
- `browser_tool` covers the 80% case this app actually needs: "does my UI render right, click through this flow, show me
  the console error" — in-app, visible, session-owned, fits the app's own permission/logging model.

---

## Workflow

```
open → navigate <url> → snapshot (get @eN refs) → click/fill/select using those refs → snapshot again to confirm
```

- `snapshot` returns an accessibility tree with stable `@eN` refs (`@e1`, `@e2`, …) — prefer acting on refs over
  guessing coordinates.
- Refs are only valid until the next `snapshot` (or a navigation) — re-run `snapshot` if a ref stops resolving.
- `screenshot --annotated` overlays `@eN` labels directly on the page for visual debugging when the accessibility tree
  alone isn't enough.

---

## Commands

| Command                                   | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
|-------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `open`                                    | Create/focus the session's browser window. Implicitly run by `navigate` too.                                                                                                                                                                                                                                                                                                                                                                                        |
| `navigate <url>`                          | Only `http:`, `https:`, and `about:` schemes are allowed — `file:`/`data:`/etc. are rejected so the tool can't be used to read local files back into the model's context. Enforced on the window itself (`will-navigate`/`will-redirect`/`setWindowOpenHandler`), not just on this command's argument, so a page redirect, link, or `evaluate`-triggered navigation can't reach a disallowed scheme either.                                                         |
| `back` / `forward`                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `snapshot`                                | Accessibility tree with `@eN` refs.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `click <ref>`                             | Scrolls the element into view first.                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `fill <ref> <value>`                      | Clears the field, then types `<value>` character-by-character.                                                                                                                                                                                                                                                                                                                                                                                                      |
| `select <ref> <value>`                    | Native `<select>` elements only — see Limitations.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `type <text>`                             | Types into whatever element currently has focus (no ref needed).                                                                                                                                                                                                                                                                                                                                                                                                    |
| `key <key> [modifier]`                    | `modifier` is one of `shift\|control\|alt\|meta`.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `scroll <up\|down\|left\|right> [amount]` | `amount` defaults to 400px.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `screenshot [--annotated]`                | Returns a PNG; `--annotated` overlays `@eN` labels.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `evaluate <js>`                           | Runs in the page's main world via CDP `Runtime.evaluate`. Output is truncated at ~60k chars (same cap as `web_fetch`).                                                                                                                                                                                                                                                                                                                                              |
| `console [limit] [level]`                 | Reads the buffered `Runtime.consoleAPICalled` log (last 200 entries). `level` is one of `log\|info\|warn\|error`.                                                                                                                                                                                                                                                                                                                                                   |
| `release`                                 | Removes the "agent is controlling this" badge, hands the window back to the user, keeps it open. Also triggered by `Cmd/Ctrl+Shift+R` inside the window. Every interactive command (`click`/`fill`/`select`/`type`/`key`/`navigate`/`back`/`forward`/`evaluate`) rejects once released — this is a deliberate user action, not a transient error, so the agent should stop and ask the user before calling `open` to reclaim, rather than reclaiming automatically. |
| `close`                                   | Destroys the window.                                                                                                                                                                                                                                                                                                                                                                                                                                                |

Run `browser_tool({ command: "--help" })` for the same list from inside a session.

---

## Architecture

The tool call itself lives in the pi-server subprocess, but a subprocess can't own a `BrowserWindow` — only Electron's
main process can — so every command makes a short round trip across the process boundary before anything happens:

```
pi-server subprocess                    Electron main process
─────────────────────                   ──────────────────────
browser-tool.ts (tool definition)        agent.ts (handleOutbound)
   │  command string                        │
   ▼                                         ▼
requestBrowserTool() ──JSONL──▶ browser_tool_request ──▶ executeBrowserToolCommand()
   ▲                                         │                    │
   │                                         │                    ▼
   └──JSONL── browser_tool_result ◀──────────┘        browser-pane-manager.ts
                                                          (one BrowserWindow per
                                                           sessionId, lazily opened)
                                                                   │
                                                                   ▼
                                                          browser-cdp.ts
                                                       (webContents.debugger / CDP)
```

That round trip isn't new machinery — it reuses the same JSONL request/response shape already used for
`auth_refresh_request` and `collaboration_request` (`src/main/agent-runtime/pi/protocol.ts` defines the pair as
`MsgBrowserToolRequest` / `MsgBrowserToolResult`). The model calls `browser_tool`
(`src/main/pi-server/browser-tool.ts`), which runs in the pi-server subprocess and can't import `electron` at all — it
just ships the command string across the wire and waits for a result.

On the main-process side, `browser-tool-runtime.ts` parses that CLI-style command string and dispatches it to
`browser-pane-manager.ts`, which owns one `BrowserWindow` per `sessionId`, opened lazily on the first `open`/`navigate`.
The pane manager is also where the user-facing bits live: it injects the "agent is controlling this" badge on every page
load, listens for the `Cmd/Ctrl+Shift+R` release shortcut, and pushes `browser-state-changed` events out to the
renderer's status pill (`BrowserStatusPill.tsx`, mounted in `ChatHeader.tsx`). The actual CDP work — accessibility
snapshots, click/fill/select/type/key, scroll, screenshot (plus the annotated overlay), evaluate, and the console log
buffer — is isolated in `browser-cdp.ts`, a thin wrapper around `webContents.debugger` (protocol version 1.3).

The window is destroyed when its session is deleted (`sessions:delete` IPC handler) or the app quits (`will-quit` in
`src/main/index.ts`), and it cleans itself up if the user just closes it via OS controls. Permission-wise,
`browser_tool`
is gated like any other tool with side effects: blocked in plan mode, and requires the normal ask-mode confirmation
round-trip. It is deliberately not treated as read-only (unlike `web_fetch`) despite never touching local files/system
state, because that's beside the point: `click`/`fill`/`select`/`type`/`key`/`evaluate` can still submit forms, trigger
destructive buttons, or run arbitrary JS against whatever real site the agent has navigated to. Plan/ask mode exists to
gate exactly that kind of side effect, local or remote, so `browser_tool` is not exempt.

Each pane also gets its own Electron session partition (`persist:browser-pane-<sessionId>`) rather than sharing the app
shell's `defaultSession` — without that, every pane (and the main app window) would silently share the same
cookie/localStorage/IndexedDB jar, so logging into a site in one chat session's browser would leak that login into every
other session's pane.

---

## Limitations / deferred

Intentionally trimmed from a fuller "computer use" browser tool (see Craft Agents' `browser_tool` for the fuller
version, which this was modeled on) to keep the first version small and correct:

| Deferred                                            | Why it might still be worth adding                                                                                                                                                                                                                   |
|-----------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `click-at <x,y>` / `drag`                           | Needed for canvas-based UIs (Google Sheets/Docs, charts) where elements have no accessible DOM ref.                                                                                                                                                  |
| Clipboard (`set-clipboard`/`get-clipboard`/`paste`) | Bulk TSV-style data entry into web apps.                                                                                                                                                                                                             |
| `upload <ref> <path>`                               | File-input support.                                                                                                                                                                                                                                  |
| `wait <selector\|text\|url\|network-idle>`          | A real polling primitive instead of retrying `snapshot`/`screenshot` by hand on slow-loading pages.                                                                                                                                                  |
| `network [limit] [status]`                          | Request/response log for debugging failed API calls — same shape as the console buffer already built, just for the `Network` CDP domain.                                                                                                             |
| Command batching (`;`-separated) / array-mode args  | Turn/token efficiency for multi-step interactions; skipped for a simpler, correct-first parser.                                                                                                                                                      |
| `screenshot` size/resolution cap                    | The image is returned as an uncapped base64 PNG — unlike `web_fetch`'s ~60k-char text cap, nothing bounds how large a single screenshot (or several in one round) can be. See [COMPACTION.md](COMPACTION.md) for the token-budget risk this creates. |

Explicitly **not** planned (see the architecture discussion this feature came out of):

- Multi-window/tabs per session — one window per session is enough for a coding assistant's use case.
- Remote/hosted dispatch (driving a browser from a server to a different machine's desktop client) — Minimalist Agent
  has no hosted/multi-client topology.
- Anti-bot mouse-jitter / CAPTCHA detection — this tool targets localhost/staging app checks, not public-site scraping.
- True pixel-embedded pane inside the chat layout (`WebContentsView` bounds-synced to a resizable region) — the current
  window is a separate, app-owned `BrowserWindow` instead; embedding is higher-risk (bounds/resize/focus sync) and was
  deferred rather than shipped untested.
