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
navigate <url> → find <text> / snapshot --interactive (get @eN refs) → click/fill/select using those refs → confirm
```

- `snapshot` returns an accessibility tree with stable `@eN` refs (`@e1`, `@e2`, …) — prefer acting on refs over
  guessing coordinates.
- Reads are the main token cost, so the cheap forms come first: `find <text>` (≤20 matches), `snapshot --interactive`
  (interactive roles only), `snapshot --within <ref>` (one region), and `text` (readable content, no tree).
- A plain `snapshot` starts a fresh ref table; `find` and `--within` add to it, so earlier refs stay valid. Any
  navigation invalidates all refs.
- Predictable steps go in one call via `commands: [...]` — run in order, stopping at the first error. One call is one
  ask-mode approval, which is most of the point.
- `screenshot --annotated` overlays `@eN` labels directly on the page for visual debugging when the accessibility tree
  alone isn't enough.

---

## Commands

| Command                                                                                   | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `open`                                                                                    | Create/focus the session's browser window. Implicitly run by `navigate` too.                                                                                                                                                                                                                                                                                                                                                                                        |
| `navigate <url>`                                                                          | Only `http:`, `https:`, and `about:` schemes are allowed — `file:`/`data:`/etc. are rejected so the tool can't be used to read local files back into the model's context. Enforced on the window itself (`will-navigate`/`will-redirect`/`setWindowOpenHandler`), not just on this command's argument, so a page redirect, link, or `evaluate`-triggered navigation can't reach a disallowed scheme either.                                                         |
| `back` / `forward`                                                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `snapshot [--interactive] [--within <ref>] [--max <n>]`                                   | Accessibility tree with `@eN` refs, capped at 300 nodes.                                                                                                                                                                                                                                                                                                                                                                                                            |
| `find <text>`                                                                             | Elements whose accessible name or value contains `<text>` (case-insensitive, ≤20).                                                                                                                                                                                                                                                                                                                                                                                  |
| `text`                                                                                    | `innerText` of `main`/`article`/`[role=main]`, else `body`; truncated at ~60k chars.                                                                                                                                                                                                                                                                                                                                                                                |
| `click <ref>`                                                                             | Scrolls the element into view first, then clicks via CDP `Input.dispatchMouseEvent`, which resolves once the event is delivered (unlike `webContents.sendInputEvent`) and uses page CSS pixels, so it stays correct under viewport emulation.                                                                                                                                                                                                                       |
| `click-at <x> <y>`                                                                        | Click at viewport CSS-pixel coordinates — for canvas UIs and anything without an accessible ref.                                                                                                                                                                                                                                                                                                                                                                    |
| `hover <ref>` / `hover <x> <y>`                                                           | Moves the mouse there (hover menus, tooltips).                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `fill <ref> <value>`                                                                      | Clears the field, then inserts `<value>` in one `Input.insertText` call (an IME-style commit that fires a native `input` event). Use `type` when a page needs per-key events.                                                                                                                                                                                                                                                                                       |
| `select <ref> <value>`                                                                    | Native `<select>` elements only — see Limitations.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `type <text>`                                                                             | Types into whatever element currently has focus (no ref needed).                                                                                                                                                                                                                                                                                                                                                                                                    |
| `key <key> [modifier]`                                                                    | `modifier` is one of `shift\|control\|alt\|meta`.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `scroll <up\|down\|left\|right> [amount]`                                                 | `amount` defaults to 400px.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `screenshot [--annotated] [--scale 0.1-1] [--region x0,y0,x1,y1]`                         | PNG capped at 1280px wide (retina panes would otherwise be ~2560px). `--scale` shrinks further; `--region` crops to a viewport CSS-pixel rectangle (the result text reports the viewport size). `--annotated` overlays `@eN` labels.                                                                                                                                                                                                                                |
| `evaluate <js>`                                                                           | Runs in the page's main world via CDP `Runtime.evaluate`. Output is truncated at ~60k chars (same cap as `web_fetch`).                                                                                                                                                                                                                                                                                                                                              |
| `console [limit] [level]`                                                                 | Reads the buffered `Runtime.consoleAPICalled` log (last 200 entries). `level` is one of `log\|info\|warn\|error`.                                                                                                                                                                                                                                                                                                                                                   |
| `network [limit] [--failed] [--filter <text>] [--all]`                                    | Request log (last 300) from Electron `webRequest` on the pane's partition — status, method, type, duration, errors; no bodies. Images/fonts/CSS hidden unless `--all`.                                                                                                                                                                                                                                                                                              |
| `wait <ms>` / `wait text <text>` / `wait url <substring>` / `wait idle` `[--timeout <s>]` | Polls every 250ms until the condition holds (text is a case-insensitive `innerText` match; idle = nothing in flight for 500ms). Default 10s, max 30s; times out with an error.                                                                                                                                                                                                                                                                                      |
| `viewport <mobile\|tablet\|desktop\|WxH>`                                                 | CDP `Emulation.setDeviceMetricsOverride` (+ touch for mobile/tablet); `desktop` clears it.                                                                                                                                                                                                                                                                                                                                                                          |
| `color-scheme <light\|dark\|auto>`                                                        | Emulates `prefers-color-scheme`; `auto` clears it. While any emulation is active the debugger stays attached (overrides reset on detach) and they're re-applied after a re-attach.                                                                                                                                                                                                                                                                                  |
| `release`                                                                                 | Removes the "agent is controlling this" badge, hands the window back to the user, keeps it open. Also triggered by `Cmd/Ctrl+Shift+R` inside the window. Every interactive command (`click`/`fill`/`select`/`type`/`key`/`navigate`/`back`/`forward`/`evaluate`) rejects once released — this is a deliberate user action, not a transient error, so the agent should stop and ask the user before calling `open` to reclaim, rather than reclaiming automatically. |
| `close`                                                                                   | Destroys the window.                                                                                                                                                                                                                                                                                                                                                                                                                                                |

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

The opt-in **Settings → App → Browser → "Share browser sign-ins across chats"** (`browserSharedProfile`) switches new
panes to one `persist:browser-pane-shared` partition instead, so a site you sign in to once stays signed in for every
chat. Still never the app's `defaultSession`. Because panes can then share a session, and `webRequest` allows only one
listener per event per session, the network log registers once per session and routes requests to each pane's log by
`webContentsId`.

---

## Limitations / deferred

Intentionally trimmed from a fuller "computer use" browser tool (see Craft Agents' `browser_tool` for the fuller
version, which this was modeled on) to keep the first version small and correct:

| Deferred                                            | Why it might still be worth adding                                                                                                          |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `drag`                                              | Needed for drag-and-drop and sliders in canvas-based UIs.                                                                                   |
| Clipboard (`set-clipboard`/`get-clipboard`/`paste`) | Bulk TSV-style data entry into web apps.                                                                                                    |
| `upload <ref> <path>`                               | File-input support.                                                                                                                         |
| Network response bodies                             | `network` comes from `webRequest`, which has no bodies; bodies would need CDP `Network.getResponseBody` and a debugger that stays attached. |

Explicitly **not** planned (see the architecture discussion this feature came out of):

- Multi-window/tabs per session — one window per session is enough for a coding assistant's use case.
- Remote/hosted dispatch (driving a browser from a server to a different machine's desktop client) — Minimalist Agent
  has no hosted/multi-client topology.
- Anti-bot mouse-jitter / CAPTCHA detection — this tool targets localhost/staging app checks, not public-site scraping.
- True pixel-embedded pane inside the chat layout (`WebContentsView` bounds-synced to a resizable region) — the current
  window is a separate, app-owned `BrowserWindow` instead; embedding is higher-risk (bounds/resize/focus sync) and was
  deferred rather than shipped untested.
