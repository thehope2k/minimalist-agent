import { useEffect, useState } from 'react';
import { hasNullDraft, subscribe } from '@/lib/input-drafts';

/**
 * Returns true when the new-session (null) slot has uncommitted text.
 * Re-renders only when that boolean flips, not on every keystroke.
 */
export function useHasNewSessionDraft(): boolean {
  const [has, setHas] = useState(() => hasNullDraft());
  useEffect(() => subscribe(() => setHas(hasNullDraft())), []);
  return has;
}
