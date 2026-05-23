// In-memory per-session input draft store.
//
// Lives outside React so both MessageInput (writer) and SessionsPanel
// (reader via useHasNewSessionDraft) can access it without prop-threading
// through App → ChatArea → SessionsPanel.
//
// SessionsPanel only cares about one bit: is there pending text in the null
// (new-session) slot? That drives whether to show the "New session" row when
// the user has switched away from it.

const drafts = new Map<string | null, string>();
const subscribers = new Set<() => void>();

function notify(): void {
  subscribers.forEach((cb) => cb());
}

export function getDraft(sessionId: string | null): string {
  return drafts.get(sessionId) ?? '';
}

export function setDraft(sessionId: string | null, text: string): void {
  // Snapshot the null-slot emptiness BEFORE the write.
  const hadNullDraft = !!(drafts.get(null) ?? '').trim();

  if (text) {
    drafts.set(sessionId, text);
  } else {
    drafts.delete(sessionId);
  }

  // Only notify subscribers when the null slot's "has content" state flips —
  // so SessionsPanel doesn't re-render on every keystroke in a real session.
  const hasNullDraftNow = !!(drafts.get(null) ?? '').trim();
  if (hadNullDraft !== hasNullDraftNow) notify();
}

/** True when the new-session (null) slot has uncommitted typed text. */
export function hasNullDraft(): boolean {
  return !!(drafts.get(null) ?? '').trim();
}

export function subscribe(cb: () => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}
