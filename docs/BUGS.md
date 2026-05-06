# Known Bugs

Bug findings from code analysis. Each entry includes reproduction steps, root cause with exact file/line references, and a clear fix description ready for implementation.

---

## BUG-005 — Pi/Copilot: "Anthropic stream ended before message_stop" shown for Copilot connection errors

**Status:** Open  
**Severity:** Medium — error fires silently, surfaces a confusing "Anthropic" brand name to users on a Copilot connection, and is classified as a generic unknown error instead of a network error  
**Affects:** Pi/Copilot connections using Claude models (claude-sonnet-4, claude-3-7-sonnet, etc.)

### Symptoms

1. User is on a GitHub Copilot connection (not an Anthropic direct connection).
2. A turn fails — error bubble appears.
3. Error title: **"Error"** — generic, unhelpful.
4. Error message: **"Something went wrong. Retry, or check the diagnostics below."** — generic.
5. Expanding **"Show diagnostics"** reveals:
   > `Anthropic stream ended before message_stop`
6. User is confused — they are on **Copilot**, not Anthropic. The error message implies they are on the wrong connection or have a misconfigured API key.

### Root Cause

**Why "Anthropic" appears for a Copilot user:**

GitHub Copilot Claude models (`claude-sonnet-4`, `claude-3-7-sonnet`, etc.) implement the Anthropic Messages API format. In `node_modules/@mariozechner/pi-ai/dist/models.generated.js` these models are registered with:

```js
// Example: claude-sonnet-4 via Copilot
{
  api: "anthropic-messages",    // <-- uses Anthropic API protocol
  provider: "github-copilot",
  baseUrl: "https://api.individual.githubcopilot.com",
}
```

Because the model's `api` is `"anthropic-messages"`, the pi-ai library routes the request through its internal **`anthropic.js` provider** (`node_modules/@mariozechner/pi-ai/dist/providers/anthropic.js`). This provider has a hardcoded brand string in its SSE stream validation:

```js
// node_modules/@mariozechner/pi-ai/dist/providers/anthropic.js:273
if (sawMessageStart && !sawMessageEnd) {
    throw new Error("Anthropic stream ended before message_stop");
}
```

This error is thrown when the Copilot gateway closes the SSE connection without emitting the final `message_stop` event — a real Copilot-side transient failure (connection drop, gateway timeout, etc.).

**Why the pi SDK does not auto-retry:**

In `node_modules/@mariozechner/pi-coding-agent/dist/core/agent-session.js` (line ~1929), `_isRetryableError` checks:

```js
return /overloaded|...|ended without|http2 request did not get a response|timed? out|timeout|terminated|.../i.test(err);
```

`"Anthropic stream ended before message_stop"` does **not** match `"ended without"` (the regex requires that exact substring). So the pi SDK **does not retry** this error. The turn fails immediately.

**Why it surfaces as `unknown_error`:**

The error propagates as `message_end { stopReason: 'error', errorMessage: "Anthropic stream ended before message_stop" }` → `adaptPiEvent` in `src/main/pi-server/event-adapter.ts` calls `parseError(new Error(msg.errorMessage))` → `parseError` in `src/main/agent/errors.ts` checks all classifiers:

- Not an AbortError
- `"anthropic stream ended before message_stop"` does not match: tool support, model, proxy, billing, auth (`401`, `unauthorized`, etc.), rate limit, service error (`500`, `502`, etc.), or **network** (`econnrefused`, `fetch failed`, etc.)
- Falls through to `unknown_error` → generic title/message

### Fix

Two changes, both small and self-contained:

**Fix A — `src/main/agent/errors.ts`: Add a classifier for SSE stream truncation**

Add a pattern before the final `unknown_error` fallback to catch SSE/streaming truncation errors and map them to `network_error` with user-friendly, provider-neutral copy:

```typescript
// In parseError, before the final unknown_error fallback.
// Catch SSE stream truncation from pi-ai's Anthropic provider, used
// for Copilot Claude models. The error mentions "Anthropic" but is
// actually a Copilot gateway issue (stream closed before message_stop).
if (
  lower.includes('stream ended before') ||
  lower.includes('stream ended without') ||
  lower.includes('before message_stop')
) {
  return buildError('network_error', original, {
    title: 'Stream interrupted',
    message:
      'The response stream was cut off before it completed. ' +
      'This is usually a transient gateway issue — retry to continue.',
  });
}
```

This gives the user actionable copy without the confusing "Anthropic" brand name, and correctly classifies the error as retryable.

**Fix B — `src/main/pi-server/event-adapter.ts`: Optionally sanitize the error message before calling `parseError`** *(optional, lower priority)*

In `adaptPiEvent` for the `message_end` case, strip the provider brand from the raw error message before passing it to `parseError` so the `originalError` field in diagnostics is also cleaner:

```typescript
case 'message_end': {
  const m = msg as { stopReason?: string; errorMessage?: string };
  if (m.stopReason === 'error' && m.errorMessage) {
    // Strip "Anthropic" brand from pi-ai's internal error strings.
    // These come from the anthropic.js provider used for Copilot Claude
    // models — the word "Anthropic" refers to the API protocol, not the
    // connection, and confuses users on Copilot.
    const sanitized = m.errorMessage.replace(/^Anthropic\s+/i, 'API ');
    out.push({ type: 'error', error: parseError(new Error(sanitized)) });
    reset();
    return out;
  }
```

**Fix A is required.** Fix B is optional polish.

**Note:** The pi SDK's `_isRetryableError` inside `agent-session.js` also does not retry this error. Fixing that would require a change to the third-party SDK, which is out of scope. Fix A's `canRetry: true` (inherited from `network_error` definition) ensures the **Retry** button is shown so the user can manually retry, which is the correct UX.

---

## BUG-001 — Pi/Copilot: "Agent is already processing" error on fast follow-up send

**Status:** Open  
**Severity:** High — causes the user's next message to always fail once, requiring a second retry  
**Affects:** Pi/Copilot connections only (`copilot_oauth` auth type)

### Symptoms

1. A turn runs for a while (especially long or error-terminating turns).
2. The turn ends — streaming spinner clears, error or result bubble shown.
3. User types a follow-up and sends immediately.
4. The message fails with an error bubble whose `originalError` contains:
   > `Agent is already processing. Specify streamingBehavior ('steer' or 'followUp') to queue the message.`
5. Sending the **same message again** succeeds without issue.

### Root Cause

In `src/main/pi-server/index.ts`, `handlePrompt` calls `await state.session.prompt(…)` and relies on `forwardEvent` (the Pi SDK subscription callback) to clear `state.currentTurnId` when a terminal event (`turn_done` or `error`) is emitted:

```typescript
// src/main/pi-server/index.ts — forwardEvent
if (ev.type === 'turn_done' || ev.type === 'error') {
  state.currentTurnId = undefined;
  state.turnAbort = undefined;
}
```

The problem is that **Pi SDK subscription events fire synchronously inside `session.prompt()`'s execution, before its promise resolves**. So the sequence is:

```
session.prompt() called
  │
  ├─ Pi SDK emits terminal event (agent_end / message_end with error)
  │    └─ forwardEvent fires:
  │         state.currentTurnId = undefined   ← turn considered DONE
  │         sends turn_done / error to main
  │         main sends to renderer
  │         renderer: isStreaming = false  ← USER SEES TURN DONE
  │
  │  ... session.prompt() STILL HASN'T RESOLVED (internal cleanup) ...
  │
  ├─ User sends new message  ← arrives here during the gap
  │    └─ handlePrompt sets state.currentTurnId = newTurnId
  │         session.prompt() called again ← THROWS "Agent is already processing"
  │
  └─ session.prompt() finally resolves (too late)
```

The `rl.on('line', …)` handler makes this worse because it fires `dispatch(parsed).catch(…)` **without `await`**, so new prompt messages are processed concurrently with the still-resolving previous one:

```typescript
// src/main/pi-server/index.ts — entrypoint
rl.on('line', (line) => {
  ...
  dispatch(parsed).catch(...);  // NOT awaited — concurrent dispatch
});
```

The thrown error is from `node_modules/@mariozechner/pi-coding-agent/dist/core/agent-session.js` line ~727:
```js
throw new Error("Agent is already processing. Specify streamingBehavior ('steer' or 'followUp') to queue the message.");
```

### Fix

Track the active `session.prompt()` promise independently of `state.currentTurnId`. Before calling `session.prompt()` for a new turn, wait for any in-flight promise to resolve first.

In `src/main/pi-server/index.ts`:

1. Add a module-level variable to track the in-flight `session.prompt()` promise:
   ```typescript
   // Track the live session.prompt() promise so new prompts wait for it.
   let activePromptPromise: Promise<void> | null = null;
   ```

2. Rewrite `handlePrompt` to wait on `activePromptPromise` before proceeding:
   ```typescript
   async function handlePrompt(msg: MsgPrompt): Promise<void> {
     if (!state.session) fatal('Received prompt before init');

     // Wait for any in-flight session.prompt() to fully resolve before starting
     // a new one. This bridges the gap where the terminal subscription event
     // (agent_end / message_end error) fires — clearing state.currentTurnId and
     // notifying main — but session.prompt() hasn't returned yet.
     if (activePromptPromise) {
       await activePromptPromise;
     }

     state.currentTurnId = msg.turnId;
     state.turnAbort = new AbortController();

     const run = async () => {
       try {
         await state.session!.prompt(msg.message, {
           images: msg.images?.map((i) => ({
             mimeType: i.mimeType,
             data: i.data,
           })) as never,
         });
       } catch (e) {
         const message = e instanceof Error ? e.message : String(e);
         if (state.currentTurnId) {
           const out: MsgEvent = { ... }; // same error-event logic as before
           send(out);
           state.currentTurnId = undefined;
           state.turnAbort = undefined;
         } else {
           fatal(message);
         }
       }
     };

     activePromptPromise = run();
     try {
       await activePromptPromise;
     } finally {
       activePromptPromise = null;
     }
   }
   ```

**No changes are needed** outside `pi-server/index.ts`. The fix is fully contained there.

---

## BUG-002 — Pi/Copilot: "terminated" network error surfaces as generic unknown error

**Status:** Open  
**Severity:** Medium — error is shown, but the title/message is unhelpful ("Error" / "Something went wrong")  
**Affects:** Pi/Copilot connections only

### Symptoms

1. A Copilot turn runs for several minutes (auto-retry loop in progress — see BUG-003).
2. Turn eventually ends with an amber error bubble.
3. Error title is **"Error"** and message is **"Something went wrong. Retry, or check the diagnostics below."**
4. Expanding diagnostics reveals `originalError: "terminated"` (or a message containing "terminated").

### Root Cause

The Copilot API occasionally terminates HTTP/2 streams mid-response. The pi SDK's `agent-session.js` recognises `"terminated"` as a retryable error (line ~1929):

```js
return /overloaded|...|terminated|retry delay/i.test(err);
```

After exhausting retries it emits `message_end` with `stopReason: 'error'` and `errorMessage` containing `"terminated"`. In `src/main/pi-server/event-adapter.ts`, this reaches:

```typescript
case 'message_end': {
  if (m.stopReason === 'error' && m.errorMessage) {
    out.push({ type: 'error', error: parseError(new Error(m.errorMessage)) });
```

`parseError` in `src/main/agent/errors.ts` has no classifier for the `"terminated"` string — it falls through to `unknown_error` with a generic title/message.

### Fix

Add a `"terminated"` (HTTP/2 / network stream termination) classifier to `parseError` in `src/main/agent/errors.ts`.

1. Add a new `ErrorCode` value for network stream termination, **or** reuse `network_error` with overridden copy:
   ```typescript
   // In parseError, before the final unknown_error fallback:
   if (
     lower.includes('terminated') ||
     lower.includes('http2') ||
     lower.includes('stream was reset') ||
     lower.includes('connection closed')
   ) {
     return buildError('network_error', original, {
       title: 'Connection terminated',
       message:
         'The connection to the Copilot API was interrupted (HTTP/2 stream terminated). ' +
         'This is usually transient — retry to continue.',
     });
   }
   ```

2. Optionally add a `canRetry: true` and `retryDelayMs: 1000` so the Retry button is clearly offered.

This gives the user actionable copy instead of the generic fallback, and correctly classifies the error as retryable.

---

## BUG-003 — Pi/Copilot: Turn appears "stuck" for minutes during silent auto-retry

**Status:** Open  
**Severity:** Medium — poor UX; user sees a spinner with no indication that the agent is retrying  
**Affects:** Pi/Copilot connections only

### Symptoms

1. User sends a message to a Copilot connection.
2. The streaming spinner (`StreamStatus`) shows continuously for 2–5+ minutes.
3. No progress appears to be made (tool calls may have stopped updating).
4. Eventually the turn terminates with a "terminated" error (see BUG-002).

### Root Cause

The pi SDK (`agent-session.js`) has a built-in auto-retry loop for transient network errors. When the Copilot API terminates an HTTP/2 stream, the SDK quietly retries without emitting any event visible to our code — the retries happen entirely inside `session.prompt()` with only a delay between attempts.

Our `StreamStatus` component (`src/renderer/src/components/chat/StreamStatus.tsx`) shows the last active `MessagePart` (tool name, "Writing", "Thinking", etc.) but has no knowledge of the SDK's internal retry state.

The `event-adapter.ts` **does** handle `auto_retry_start` events (which the pi SDK can emit):
```typescript
case 'auto_retry_start':
  out.push({ type: 'text_delta', text: '\n_…retrying after a transient error…_\n' });
  return out;
```

However this event is only emitted by certain Pi SDK versions / configurations and may not fire for all retry types. If it doesn't fire, the user sees no feedback.

### Fix

Two complementary improvements:

**Fix A — Renderer: Show elapsed time warning in `StreamStatus`**

`StreamStatus` already tracks elapsed time. Add a visual cue when the turn has been running unusually long (e.g. > 90 seconds), suggesting the agent may be retrying:

```tsx
// src/renderer/src/components/chat/StreamStatus.tsx
// In the returned JSX, after the elapsed counter:
{elapsed > 90_000 && (
  <span className="ml-1 text-amber-400/70" title="Turn is taking longer than usual — may be retrying a connection error">
    ⚠
  </span>
)}
```

**Fix B — Pi server: Emit a progress event if `auto_retry_start` is not already handled**

Verify that `auto_retry_start` events are actually being emitted by checking the pi SDK's subscription during long turns. If the SDK does emit them, the existing adapter handler already converts them to a visible text delta. No code change is needed — but the real fix is BUG-002 (surface the error clearly when retries are exhausted).

**Note:** Fix A is a small, safe, self-contained renderer change. Fix B requires runtime verification — it may already be working.

---

## BUG-004 — Pi/Copilot: `stopReason: 'stop'` amber badge shown on all normal Pi turns

**Status:** Open  
**Severity:** Low — cosmetic; every successfully completed Pi turn shows an amber "stop" badge that implies something went wrong  
**Affects:** Pi/Copilot connections only

### Symptoms

Every completed Pi/Copilot assistant message shows an amber `stopReason` badge reading **"stop"** in the message footer — the same styling used to flag unusual stop conditions.

### Root Cause

In `src/main/pi-server/event-adapter.ts`, `agent_end` always hardcodes `stopReason: 'stop'`:

```typescript
case 'agent_end': {
  out.push({ type: 'turn_done', stopReason: 'stop' });
  return out;
}
```

In `src/renderer/src/components/chat/MessageList.tsx`, the amber badge renders for any `stopReason` that isn't `'end_turn'`:

```typescript
const showStopBadge =
  !m.isStreaming && m.stopReason && m.stopReason !== 'end_turn' && !isUser;
```

`'stop'` !== `'end_turn'` → badge always shown for Pi turns. The Anthropic backend correctly returns `'end_turn'` (from the Claude API `result.stop_reason`) and so the badge is hidden for normal Anthropic turns.

### Fix

Two options — pick one:

**Option A (preferred):** Change the Pi adapter to emit `'end_turn'` for normal successful completions, matching the Anthropic convention:

```typescript
// src/main/pi-server/event-adapter.ts
case 'agent_end': {
  out.push({ type: 'turn_done', stopReason: 'end_turn' });
  return out;
}
```

**Option B:** Extend the badge suppression in `MessageList.tsx` to also hide `'stop'`:

```typescript
const showStopBadge =
  !m.isStreaming &&
  m.stopReason &&
  m.stopReason !== 'end_turn' &&
  m.stopReason !== 'stop' &&   // add this
  !isUser;
```

Option A is cleaner — `'end_turn'` is the semantic equivalent for Pi ("the agent decided to stop"), and it keeps the renderer logic unchanged. Option B is a broader suppress that might hide genuinely unusual `'stop'` reasons in future backends.

---

## BUG-006 — Sessions continuously reorder in the list while multiple turns run simultaneously

**Status:** Open  
**Severity:** Medium — poor UX; sessions visibly jump and swap positions in the sidebar on every streaming event, making it hard to navigate between sessions  
**Affects:** All backends; most visible when two or more sessions are streaming at the same time

### Symptoms

1. Start a turn in Session A.
2. Switch to Session B and start a second turn.
3. Both sessions show the streaming spinner.
4. The session list continuously reorders — Session A and B keep swapping positions every ~1 second.
5. Any other sessions in the list are also displaced by the sorting churn.
6. After both turns complete the list stabilises, but sessions may have ended up in a different order than expected.

### Root Cause

Three separate issues stack together to produce this bug:

**Layer 1 — `chatToStored` always generates a fresh `createdAt: Date.now()`**

In `src/renderer/src/lib/chat.ts`:
```typescript
export function chatToStored(msg: ChatMessage): StoredMessage {
  return {
    ...                     // other fields from msg
    createdAt: Date.now(), // ← always NOW, ignores msg.createdAt
  };
}
```

`ChatMessage` has a `createdAt?: number` field (preserved from disk on load via `chatFromStored`), but `chatToStored` ignores it and stamps the current wall-clock time every time it is called.

**Layer 2 — `replaceLastMessage` in main bumps `lastMessageAt` from that fresh timestamp**

In `src/main/storage/sessions.ts`:
```typescript
export function replaceLastMessage(id: string, msg: StoredMessage): void {
  // ... replaces the JSONL line in the messages file ...
  const meta = load(metaSchema(id));
  meta.id = id;
  meta.lastMessageAt = msg.createdAt; // ← set to Date.now() from Layer 1
  save(metaSchema(id), meta);
}
```

Every call to `replaceLastMessage` rewrites `meta.lastMessageAt` to whatever `msg.createdAt` is — which is `Date.now()` at the moment `chatToStored` was invoked.

**Layer 3 — The renderer's `replaceLastMessage` wrapper calls `reload()` after every write**

In `src/renderer/src/lib/sessions.ts`:
```typescript
export async function replaceLastMessage(id: string, msg: StoredMessage): Promise<void> {
  await window.api.sessions.replaceLastMessage(id, msg);
  await reload(); // ← re-fetches + re-sorts the full session list from disk
}
```

`reload()` calls `window.api.sessions.list()` which in main returns sessions sorted by `lastMessageAt` descending (line 208 of `sessions.ts`). Because `lastMessageAt` was just bumped to `Date.now()`, this session moves toward the top of the sort.

**The combined effect — checkpoint writes every second**

During streaming, `useChat.ts` schedules a debounced checkpoint every `CHECKPOINT_DEBOUNCE_MS = 1000 ms` (line 259). Each checkpoint fires:

```
chatToStored(msg)               → createdAt = Date.now()  (Layer 1)
  └─ replaceLastMessage(sid)    → lastMessageAt = Date.now()  (Layer 2)
       └─ reload()              → full session list re-fetched + re-sorted  (Layer 3)
            └─ notify()         → useSessions subscribers re-render
                 └─ SessionsPanel re-renders with new sort order
```

With **N concurrent streaming sessions**, all N fire their checkpoints independently. Each one bumps its own `lastMessageAt` to `Date.now()`, causing the list to re-sort. Sessions continuously leapfrog each other because whichever one had its checkpoint fire most recently has the highest `lastMessageAt`.

The per-turn final write (`turn_done` / `error` handler in `useChat.ts`) uses the exact same path (`chatToStored` → `replaceLastMessage`) and has the same problem.

**Why `appendMessage` does not cause the same issue**

`appendMessage` also calls `meta.lastMessageAt = msg.createdAt`, but the `StoredMessage` passed there is constructed from a newly created `ChatMessage` with `createdAt` set at turn-start (via `chatToStored` at that exact moment). This is intentional — a new turn genuinely should surface the session. The problem is specifically that `replaceLastMessage`, which is an in-place update of an already-existing message, keeps re-bumping the timestamp on every write.

### Fix

Two changes, both small and completely independent:

**Fix A — `src/main/storage/sessions.ts`: Remove `lastMessageAt` update from `replaceLastMessage`**

`replaceLastMessage` is a content update, not a structural one — it rewrites an existing message in place (checkpoint persistence, turn completion). The session's sort position should not change for in-place updates. Only `appendMessage` (new message added) should control `lastMessageAt`.

```typescript
export function replaceLastMessage(id: string, msg: StoredMessage): void {
  ensureSessionDir(id);
  const mp = messagesPath(id);
  // ... find and replace the line in the JSONL file (unchanged) ...

  // Remove the meta load/save block entirely.
  // lastMessageAt must only be bumped by appendMessage (new content),
  // not by replaceLastMessage (in-place update of an existing message).
  // Bumping here causes sessions to continuously re-sort in the list
  // every 1s during streaming (checkpoint interval).
}
```

The existing meta load/save in `replaceLastMessage` was ONLY setting `lastMessageAt`. Removing it means the function only touches the messages JSONL file — which is its stated purpose.

**Fix B — `src/renderer/src/lib/sessions.ts`: Remove `reload()` from `replaceLastMessage`**

The session list (title, sort order, project) does not change when a message is replaced in-place. There is nothing to reload. The `reload()` here fires on every 1-second checkpoint and every turn-completion write, causing full re-fetches from disk and full list re-renders with no benefit.

```typescript
export async function replaceLastMessage(
  id: string,
  msg: StoredMessage,
): Promise<void> {
  await window.api.sessions.replaceLastMessage(id, msg);
  // Do NOT call reload() here.
  // replaceLastMessage is an in-place content update — the session list
  // sort order, title, and project membership don't change. Calling
  // reload() caused the full session list to be re-fetched and re-sorted
  // every ~1s per streaming session, making sessions visibly jump in
  // the sidebar while streaming.
}
```

**Fix C (secondary) — `src/renderer/src/lib/chat.ts`: Preserve `msg.createdAt` in `chatToStored`**

This doesn't directly fix the list-jumping (Fixes A + B are sufficient) but prevents a related latent bug where `chatToStored` would stamp wrong timestamps on messages if `replaceLastMessage` ever does need to update `lastMessageAt` for other reasons.

```typescript
export function chatToStored(msg: ChatMessage): StoredMessage {
  return {
    // ... other fields ...
    createdAt: msg.createdAt ?? Date.now(), // preserve original; only use Date.now() for brand-new messages
  };
}
```

**Fix A + Fix B are required.** Fix C is defensive hygiene.

**Note:** After these fixes, `replaceLastMessage` becomes a pure message-content write with no session-list side effects. The session list will only re-sort when:
- A new session is created (`createSession`)
- A new message is first appended (`appendMessage`)
- Session metadata changes explicitly (`updateSessionMeta` — e.g. title generation)  
This is the correct behaviour.
