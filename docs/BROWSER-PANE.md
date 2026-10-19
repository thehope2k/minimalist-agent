# Browser pane

Each chat has its own real Chromium page, shown in the app's right side panel next to the conversation. The agent
drives it through `browser_tool`; the user watches, navigates, signs in, takes over, and hands back on the same page.

This doc covers the pane: what the user sees, how the page is hosted, and the constraints that shape it. The
agent-facing commands are documented in [BROWSER-TOOL.md](BROWSER-TOOL.md).

---

## 1. What the user sees

### Layout

The right side panel is a single slot shared by **Files**, **Context**, and **Browser** (`ActiveSidePanel` in
`usePanelStates.ts`); only one shows at a time. Each kind remembers its own width. The browser opens at **45%** of the
main area and can widen to **70%**; Files and Context cap at 40%. The chat column never drops below 30%.

```
┌─────────────────────────────────────────────────────────────────┐
│ ← → ⟳ │ localhost:5173/login                 │ 🤖 Agent │ ⋯ │ ⇥ │  ← toolbar (HTML)
├─────────────────────────────────────────────────────────────────┤
│┌───────────────────────────────────────────────────────────────┐│
││                                                               ││  ← 2px frame, accent while
││                 page (native WebContentsView)                 ││    the agent is acting
││                                                               ││
│└───────────────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────────┤
│ 🤖 Agent is clicking button "Sign in"                 Take over │  ← activity bar, while acting
└─────────────────────────────────────────────────────────────────┘
```

- **Back / forward / reload.** Disabled when there's no history; reload becomes stop while a page loads.
- **Address field** (`Cmd/Ctrl+L`). Accepts a full http(s) URL or a bare host. Bare local hosts (`localhost:5173`,
  `127.0.0.1:8080`) get `http://`, everything else `https://`. Other schemes and non-addresses are rejected with a
  red outline.
- **Control chip.** **Agent** means the agent may drive the page; click it to take over. **You** means the user
  controls it; click it to hand the page back.
- **More (⋯).** Pop out to window, Open DevTools, Close page.
- **Hide (⇥).** Hides the panel; the page keeps running.
- **Activity bar.** Shown while the agent is acting. It names the current action in plain words and offers
  **Take over**. The same text appears in the header control's tooltip and as a pulsing globe on the chat's row in the
  session list, so background chats show their browsing too.

A chat without a page shows "No browser in this chat" with an **Open browser** button.

### The header control

The chat header has one browser control (`BrowserStatusPill.tsx`): a globe button when the chat has no page, or the
page title when it has one, plus an agent icon while the agent may drive it. Either way it toggles the panel, as does `Cmd/Ctrl+Shift+O`. While the
panel is hidden and the agent is acting, the control shows a moving ring.

### When the panel opens by itself

When a page appears in the chat on screen (the agent's first `browser_tool` command, or the user opening one), the
panel opens, **once per chat**. If the user then closes it, it stays closed for that chat; the header control still
reopens it. Pages created in background chats never open the panel.

### Switching chats

The panel always shows the active chat's page. Other chats' pages are detached but keep running at full speed, so the
agent can keep working in a background chat. Switching back shows the page exactly as it was, with no reload.

### Who controls the page

| Event                                                                                          | Result                                                                                           |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| A page is created (by the agent or the user)                                                   | The agent may drive it                                                                           |
| The agent runs `open`, or any command that creates the page                                    | The agent takes control back if it had been released                                             |
| The user clicks **Take over** or the **Agent** chip, or presses `Cmd/Ctrl+Shift+R` in the page | The user controls it; the agent's page-changing commands fail with a "user took control" message |
| The user **clicks or types inside the page**                                                   | Same as Take over                                                                                |
| The user scrolls, hovers, or presses a `Cmd/Ctrl` shortcut                                     | No change: watching isn't acting                                                                 |
| The user clicks **You** (hand back)                                                            | The agent may drive it again; the agent isn't prompted                                           |
| The user navigates from the toolbar                                                            | Allowed either way; control doesn't change                                                       |

The agent is told in its tool description not to reclaim a page the user took over unless the user asks.

### Pop out

**Pop out to window** moves the live page into its own window, with no reload. The window title shows the page title and
who's in control. The panel shows "This chat's browser is in a separate window" with **Bring it back**. Closing the
window docks the page back rather than closing it.

### When app UI covers the page

The page is a native view drawn above all of the app's HTML. Whenever app UI would overlap it — a menu, popover,
tooltip, dialog, or a resize drag across its edge — the pane **freezes**: a still image of the page replaces it until
the overlay closes. The page keeps running and the agent keeps working while frozen; only the user's view pauses.

---

## 2. What the agent sees

- **One page per chat**, created on the first command (or already opened by the user).
- **The viewport is the pane's size**, e.g. ~650px wide at 45% of a 1440px window, so layouts can hit tablet
  breakpoints. Screenshots report the viewport size. A page that has never been on screen is 1280×860; a detached page
  keeps its last size. `viewport` overrides it.
- **Pages never throttle**, on screen or not.
- **Dialogs never block.** `alert`/`confirm`/`prompt` are answered automatically and reported in the command's output
  (§4.3).
- **Clicks and hovers work whether or not the page is painting** (§4.4).
- Nothing the pane draws is injected into the page, so snapshots and screenshots contain only the page itself.

---

## 3. Architecture

Main owns every page. The renderer owns the HTML around it and reports **where** the active chat's page should be
drawn.

```
Renderer                                              Main
────────                                              ────
BrowserPanel                                          BrowserPaneManager
  ├─ Chrome / ActivityBar / EmptyState / PoppedOut      per chat: WebContentsView + BrowserCDP + NetworkLog,
  │    └─ browser:* actions ────────────────────────▶     agentControl, docked, popout, lastUsed
  ├─ page slot <div>                                     agent activity: label + agent-acting window
  │    └─ useSurfaceSync ── browser:setSurface ─────▶   setSurface → dock one page into the main window,
  └─ freeze <img> ◀───── browser:freezeImage ───────     detach the rest
                                                        browser-tool-runtime ◀── browser_tool commands
◀── browser-state-changed { url, title, agentControl, canGoBack, canGoForward,
                            loading, activity, poppedOut } ─────────────────────
◀── browser-forwarded-key (app shortcuts pressed inside a page) ────────────────
```

### 3.1 Main process

| File                              | Role                                                                                                                                     |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `browser/browser-pane-manager.ts` | Page lifecycle, docking, control, agent activity, pop-out, permissions, page cap. Agent commands go through it.                          |
| `browser/browser-surface.ts`      | Pure helpers: which page docks for a given surface, bounds rounding, scheme allowlist, address-field normalization.                      |
| `browser/browser-cdp.ts`          | CDP wrapper per page: accessibility snapshots, input, screenshots and freeze frames, emulation, console, dialog guard, pointer fallback. |
| `browser/browser-dialogs.ts`      | The injected dialog guard and how dialogs are reported.                                                                                  |
| `browser/browser-activity.ts`     | Plain-words labels for agent commands ("clicking button "Sign in"").                                                                     |
| `browser/browser-network-log.ts`  | Per-page request log from `webRequest`, routed by `webContentsId`.                                                                       |
| `browser/browser-tool-runtime.ts` | Parses `browser_tool` commands; wraps each in the agent-acting window and appends page dialogs to its output.                            |
| `ipc/browser-ipc.ts`              | Renderer channels (§3.3).                                                                                                                |

**Pages.** Each page is a `WebContentsView` with `sandbox`, `contextIsolation`, and `backgroundThrottling: false`, on
its own session partition (`persist:browser-pane-<sessionId>`), or one shared `persist:browser-pane-shared` partition
when **Settings → App → Browser → Share browser sign-ins across chats** is on. Never the app's own `defaultSession`.
A new page loads `about:blank` first, attaches CDP, and registers the dialog guard; its first real load waits for all
three (§4.1).

**Docking.** `setSurface(host, { sessionId, bounds, visible, frozen })` attaches exactly one page — the active chat's,
when it's visible, unfrozen, non-zero-sized, and not popped out — to the main window's `contentView` at `bounds`, and
removes any other. The renderer calls it up to once per animation frame; it's idempotent and cheap (300 `setBounds`
calls take ~3ms). Detached pages stay alive with their last bounds as viewport.

**Navigation guards** live on the page itself, not just on the `navigate` command: `will-navigate` and `will-redirect`
block anything outside http/https/about, and `window.open` / `target=_blank` load in the same page instead of opening
a window.

**Lifecycle.** A page closes when the user closes it, when its chat is deleted (`sessions:delete`), or when the app
quits. Closing skips `beforeunload`; a page can't veto it.

### 3.2 Renderer

| File                                               | Role                                                                                                                                                   |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `browser/BrowserPanel.tsx`                         | The panel: toolbar, framed page slot, freeze image, activity bar, empty and popped-out states.                                                         |
| `browser/browser-panel/Chrome.tsx`                 | Toolbar: history, address field, control chip, More menu, hide.                                                                                        |
| `browser/browser-panel/useSurfaceSync.ts`          | Sends the slot's rect to main on resize, window resize, chat switch, and freeze; a 250ms poll catches moves that don't resize. Unmount hides the page. |
| `browser/browser-panel/useFreeze.ts`, `overlay.ts` | Decide when to freeze (§3.4).                                                                                                                          |
| `browser/useBrowserState.ts`                       | One chat's live state: initial fetch, then pushes.                                                                                                     |
| `browser/browser-activity-store.ts`                | One shared subscription feeding every session row's browsing badge.                                                                                    |
| `browser/useBrowserAutoOpen.ts`                    | Opens the panel once per chat when a page appears in the chat on screen.                                                                               |
| `browser/useForwardedBrowserKeys.ts`               | Replays app shortcuts pressed inside a page (§4.5).                                                                                                    |
| `browser/BrowserPanelContext.tsx`                  | Lets the chat header reach the panel toggle without prop drilling.                                                                                     |

CSS pixels map directly to window DIPs (the app has no zoom), so the slot's `getBoundingClientRect()` is the page's
bounds.

### 3.3 IPC

| Channel                                                         | Direction | Purpose                                                                                         |
| --------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------- |
| `browser:getState(sessionId)`                                   | invoke    | Current state of one chat's page                                                                |
| `browser:setSurface(surface)`                                   | send      | Dock, move, freeze, or hide the active chat's page                                              |
| `browser:freezeImage(sessionId)`                                | invoke    | Current frame as a JPEG data URL, or null                                                       |
| `browser:open(sessionId)`                                       | invoke    | User opens a blank page                                                                         |
| `browser:navigate(sessionId, input)`                            | invoke    | Address-field navigation; rejects non-http(s) input                                             |
| `browser:history(sessionId, back \| forward \| reload \| stop)` | invoke    | Toolbar history buttons                                                                         |
| `browser:release(sessionId)` / `browser:handToAgent(sessionId)` | invoke    | Take over / hand back                                                                           |
| `browser:popOut(sessionId)` / `browser:dock(sessionId)`         | invoke    | Move the page into its own window and back                                                      |
| `browser:openDevTools(sessionId)`                               | invoke    | Detached DevTools for the page                                                                  |
| `browser:close(sessionId)`                                      | invoke    | Close the page                                                                                  |
| `browser-state-changed`                                         | push      | `url`, `title`, `agentControl`, `canGoBack`, `canGoForward`, `loading`, `activity`, `poppedOut` |
| `browser-forwarded-key`                                         | push      | An app shortcut pressed inside a page                                                           |

### 3.4 Freeze

`freezeReason()` (in `overlay.ts`) returns:

- **`drag`** when any panel resize handle is being dragged (`[data-separator="active"]`);
- **`overlay`** when an element that can float over the page intersects the slot: Radix popper content, `dialog`,
  `alertdialog`, `menu`, `listbox`, or any `.fixed` element. Elements inside the page slot, and anything marked
  `data-no-browser-freeze` (the desktop pet), are ignored. The toolbar's own menu does freeze the page, since it hangs
  over it;
- otherwise nothing.

`useFreeze` re-evaluates on DOM changes (child lists and the `data-separator`, `data-state`, `class`, `hidden`, `open`
attributes; not `style`, which changes constantly during animations), on window resize, and on slot resize.

An **overlay** freeze first fetches the freeze image, then tells main to detach the page, so nothing flickers. A **drag**
freeze detaches immediately (the page would otherwise swallow the drag) and the image fills in when it arrives. On thaw
the page re-docks and the image is removed one frame later, after the page has painted.

### 3.5 Control and activity

- **Agent activity.** `browser-tool-runtime` brackets every command with `beginAgentCommand(label)` /
  `endAgentCommand()`. The label (from `browser-activity.ts`) is published as `activity` and lingers 3s after the last
  command, which drives the activity bar, the accent frame, the header tooltip, and the session-row badge.
- **Takeover.** See §4.2 for how user input is told apart from the agent's.
- **Popped-out windows** show control state in their title, since they have no toolbar.

---

## 4. Constraints and how they're handled

Each of these was measured in Electron 44 and shapes the design above.

### 4.1 A page needs a document before CDP

A `WebContentsView` that has never loaded anything has no renderer target: the first CDP command never returns and a
second one crashes Electron. Every page therefore loads `about:blank` before any CDP call, and every CDP call has a 15s
timeout. A `loadURL` issued while that first load is in flight can also lose the race and leave the page on
`about:blank`, so navigation waits for it too.

### 4.2 Telling user input from agent input

`before-input-event` is keyboard-only, and `input-event` fires for CDP input as well as for real input, so neither
event alone can tell them apart. The agent only produces input inside an awaited `browser_tool` command, so main keeps
an **agent-acting window** per chat: from the start of each command until 300ms after it ends. A `mouseDown` or
non-modifier key press in the page outside that window is the user. A user click that lands during an agent command is
missed; the next one counts.

### 4.3 Dialogs

Left alone, `alert`/`confirm` show a native message box (even when CDP handles `Page.javascriptDialogOpening`), which
blocks a page nobody may be looking at, and `prompt` hangs because Electron doesn't implement it. So each page gets a
guard script (`Page.addScriptToEvaluateOnNewDocument`) that replaces them:

| While the agent controls the page | While the user does            |
| --------------------------------- | ------------------------------ |
| `alert` returns at once           | native dialog                  |
| `confirm` returns false           | native dialog                  |
| `prompt` returns null             | returns null (always replaced) |

Each replaced call reports through a CDP binding, and the next command's output says what happened:
`Page showed confirm("Delete?") — answered Cancel.` The CDP debugger stays attached for the page's whole life so the
guard survives navigation; DevTools can be open at the same time.

### 4.4 Pointer input on pages that aren't painting

Chromium hit-tests real input against compositor frames. On a page that isn't drawing — detached from the panel, or
docked while the app is minimized or covered — a CDP `mouseMoved` stalls ~5s, and on http(s) pages press/release never
reach the page at all. Whether a page is docked isn't a reliable signal, since a docked page in a minimized window has
the same problem.

So `click`, `hover`, and `click-at` probe with a real `mouseMoved` and a 300ms deadline:

- **Answered:** the page is painting. Real press/release follow (they need the preceding move).
- **Not answered** (or the page is known to be detached): the action is dispatched from inside the page — pointer and
  mouse events plus `click` on `document.elementFromPoint`, focusing form controls. This drives JS handlers, links,
  checkboxes, and canvas listeners. Its limits: events are `isTrusted: false`, and CSS `:hover` doesn't apply.

Keyboard input (`Input.insertText`, `Input.dispatchKeyEvent`) doesn't hit-test and works everywhere.

### 4.5 Keyboard focus inside a page

When a page has keyboard focus, key presses go to the page, not to the app's HTML. `Cmd/Ctrl+Shift+O`, `Cmd/Ctrl+L`, and
`Cmd/Ctrl+K` are caught in `before-input-event`, focus moves back to the app, and the renderer replays them as `keydown`
events so the app's existing handlers run. `Esc` isn't forwarded: pages need it for their own menus.

### 4.6 Background pages

`backgroundThrottling: false` keeps timers at full speed on detached pages (10 ticks/s vs ~1 when throttled), which
single-page apps and `wait` depend on. With throttling off, Electron's `capturePage()` returns nothing for detached
pages, so screenshots and freeze images always use CDP `Page.captureScreenshot`, which works everywhere.

Unthrottled background pages cost CPU and memory, so at most **6** pages are open. Opening another closes the least
recently used page that isn't on screen, popped out, or in use by the agent.

### 4.7 Permissions

Pane sessions deny every permission request and check (camera, microphone, location, notifications, …), separately from
the app's own handlers.

---

## 5. Testing

- **Unit tests:** surface docking rules and address normalization (`browser-surface.test.ts`), activity labels,
  dialog parsing and formatting, network log routing, command parsing, and the freeze/overlay rules
  (`overlay.test.ts`).
- **In Electron:** the behaviors in §4 depend on real Chromium, so they're verified by running the pane manager and
  runtime in Electron against a local HTTP server. Covered: docking and chat switching, freeze images, unthrottled
  detached pages, address-field rules, takeover by user input but not by CDP input, forwarded shortcuts, dialogs with
  agent and user control, permission denial, pop-out and dock, the page cap, and pointer input docked, detached, and
  minimized. Use `http://` pages for pointer tests: `data:` URLs don't reproduce §4.4.
- **By hand:** resizing across the page, menus over the pane, switching chats mid-run, pop out and close the window,
  light and dark themes.

## 6. Out of scope

Tabs, bookmarks, history UI, downloads, and extensions: the pane is a surface for checking and driving apps, not a
general browser. Pages don't persist across app restarts.
