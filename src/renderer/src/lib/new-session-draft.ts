// In-memory draft for the null (new-session) slot.
//
// Stores everything EXCEPT text and attachments (which live in their own
// stores) so switching away and back preserves the user's permission-mode,
// working-directory, and connection/model picks — identical lifecycle to
// input-drafts.ts and attachment-drafts.ts.

import type { PermissionMode } from './electron';

interface NewSessionStateDraft {
  permissionMode?: PermissionMode;
  autonomyLevel?: number;
  cwd?: string;
  connectionSlug?: string;
  modelId?: string;
}

let stored: NewSessionStateDraft = {};

export function getNewSessionStateDraft(): NewSessionStateDraft {
  return stored;
}

/** Merge `patch` into the stored draft — non-destructive for untouched keys. */
export function patchNewSessionStateDraft(
  patch: Partial<NewSessionStateDraft>,
): void {
  stored = { ...stored, ...patch };
}

/** Clear the stored draft — called when explicitly starting a fresh new session. */
export function clearNewSessionStateDraft(): void {
  stored = {};
}
