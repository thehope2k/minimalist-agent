# Session Branching — Implementation Plan

## Summary

Allow users to "branch" any conversation at any user message — creating a new
session that contains all prior messages as context, with the selected user
message pre-filled in the input so it can be edited and re-sent in a fresh
direction.

---

## User-facing behaviour

1. Hover over any user message → a **branch icon button** appears alongside
   the existing Copy button.
2. Click it → a new session is created in the background containing every
   message that came *before* the selected one (the prior context).
3. App navigates to the new session immediately.
4. The selected message's text is pre-filled in the input box, ready to edit
   and re-send (or send as-is to replay with fresh context).
5. The new session inherits the parent's `workingDirectory`, `connectionSlug`,
   `model`, `permissionMode`, `sddMode`, and `projectId`.
6. Session title: `"Branch: <parent title>"` (truncated to 80 chars).

---

## Why branch BEFORE the selected message?

The branch point is the moment of divergence. Including the prior context
(messages 0..N-1) gives the AI the full shared history. The selected message
itself becomes the first thing the user sends in the new thread, letting them
edit it before doing so.

---

## Layers to change

### 1 · `src/main/storage/sessions.ts`

Add:
```ts
export function branchSession(
  parentId: string,
  upToMessageId: string,   // exclusive: copy messages BEFORE this id
): SessionMeta | null
```

- Calls `loadSession(parentId)` to get meta + messages.
- Finds the cutoff index via `findIndex(m => m.id === upToMessageId)`.
  Returns `null` if id not found.
- Copies messages `[0, cutIdx)` into a new JSONL file.
- Creates new `SessionMeta` inheriting:
  `workingDirectory`, `projectId`, `connectionSlug`, `model`,
  `permissionMode`, `sddMode`, `activeFeatureSlug`.
- Title: `"Branch: <parent.title>"` sliced to 80 chars.
- Returns the new `SessionMeta`.

### 2 · `src/main/ipc.ts`

```ts
ipcMain.handle('sessions:branch', (_e, parentId: string, upToMessageId: string) =>
  branchSession(parentId, upToMessageId),
);
```

### 3 · `src/preload/index.ts`

Expose under `sessions`:
```ts
branch: (parentId, upToMessageId) =>
  ipcRenderer.invoke('sessions:branch', parentId, upToMessageId),
```

### 4 · `src/renderer/src/lib/electron.d.ts`

Add to `sessions` namespace:
```ts
branch: (parentId: string, upToMessageId: string) => Promise<SessionMeta | null>;
```

### 5 · `src/renderer/src/lib/sessions.ts`

```ts
export async function branchSession(
  parentId: string,
  upToMessageId: string,
): Promise<SessionMeta | null> {
  const meta = await window.api.sessions.branch(parentId, upToMessageId);
  if (meta) await reload();
  return meta;
}
```

### 6 · `src/renderer/src/components/chat/message-list/Bubble.tsx`

- Add `onBranch?: () => void` prop to `Bubble`.
- In `UserMessageActions`, add a `GitBranch` icon button alongside Copy.
  - Only rendered when `onBranch` is provided.
  - Shows `"Branch from here"` tooltip.
  - Brief `"Branching…"` loading state while the async call completes
    (mirroring the Copy button's `'copied'` feedback state).

### 7 · `src/renderer/src/components/chat/MessageList.tsx`

- Add `onBranch?: (messageId: string) => void` prop.
- Pass `onBranch={() => onBranch?.(m.id)}` to each `Bubble` where
  `m.role === 'user' && !m.isStreaming`.

### 8 · `src/renderer/src/components/layout/ChatArea.tsx`

Add `handleBranch(messageId: string)`:
1. Find the message in `messages` by id.
2. Extract its text content.
3. Call `branchSession(sessionId, messageId)` → returns new `SessionMeta`.
4. Store `pendingBranchDraftRef.current = { sessionId: meta.id, text }`.
5. Call `onSessionCreated(meta.id)` to navigate.

Add a `useEffect` that watches `sessionId`:
```ts
useEffect(() => {
  const d = pendingBranchDraftRef.current;
  if (d && d.sessionId === sessionId) {
    setPendingMessage(d.text);
    pendingBranchDraftRef.current = null;
  }
}, [sessionId]);
```

This fires after the parent (`App`) updates `activeSessionId` → `ChatArea`
re-renders with new `sessionId` → effect runs → `pendingMessage` is set →
`MessageInput` fills the textarea. No prop changes required in `App.tsx`.

Pass `onBranch={handleBranch}` down through `MessageList`.

---

## Data-flow diagram

```
User clicks branch button (Bubble)
  → onBranch() (Bubble prop)
  → onBranch(messageId) (MessageList prop)
  → handleBranch(messageId) (ChatArea)
      → branchSession(parentId, messageId)  [renderer lib]
          → sessions:branch IPC             [main process]
              → branchSession()             [storage]
                  creates session dir
                  writes messages JSONL
                  returns SessionMeta
      → pendingBranchDraftRef.current = { sessionId, text }
      → onSessionCreated(newSessionId)      [App.tsx]
          → setActiveSessionId(newSessionId)
  → ChatArea re-renders with new sessionId
  → useEffect fires → setPendingMessage(text)
  → MessageInput fills textarea
```

---

## Edge cases

| Case | Handling |
|---|---|
| Branch from very first user message | `cutIdx = 0` → 0 messages copied → new session starts empty with text pre-filled |
| Branch from a streaming message | `onBranch` not passed for streaming messages — button hidden |
| `branchSession` IPC fails | `null` returned → show brief error toast (or log + no-op) |
| Parent has no `connectionSlug` | Branch inherits `undefined` → falls back to default connection at send time |
| Marker rows (compaction) before cutIdx | Copied as-is — they're valid JSONL rows and render correctly |

---

## Files changed (summary)

```
src/main/storage/sessions.ts        + branchSession()
src/main/ipc.ts                     + sessions:branch handler
src/preload/index.ts                + sessions.branch expose
src/renderer/src/lib/electron.d.ts  + sessions.branch type
src/renderer/src/lib/sessions.ts    + branchSession() helper
src/renderer/src/components/chat/message-list/Bubble.tsx  + branch button
src/renderer/src/components/chat/MessageList.tsx           + onBranch prop
src/renderer/src/components/layout/ChatArea.tsx            + handleBranch
```

No changes required in `App.tsx`, `shortcuts.ts`, or any storage migration.
