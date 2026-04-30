// Detect an in-progress `@…` mention as the user types in a textarea.
//
// Triggers only when `@` is preceded by start-of-string or whitespace,
// to avoid false positives in email addresses / inline twitter handles.
// While active, captures the substring after `@` as `query` for filtering.

import { useCallback, useEffect, useState } from 'react';

export interface MentionState {
  /** True when the textarea cursor is inside an `@…` token. */
  active: boolean;
  /** Substring after the trigger `@` (used to filter the picker). */
  query: string;
  /** Absolute index of the trigger `@` in the textarea value. */
  triggerIndex: number;
  /** Cursor position when the state was last computed. */
  cursor: number;
}

const EMPTY: MentionState = {
  active: false,
  query: '',
  triggerIndex: -1,
  cursor: 0,
};

/**
 * Returns the live mention state plus a `recompute` callback for the
 * caller to drive on every input/keyup.
 */
export function useInlineMention(
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
): {
  state: MentionState;
  recompute: () => void;
  reset: () => void;
} {
  const [state, setState] = useState<MentionState>(EMPTY);

  const recompute = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return setState(EMPTY);
    const cursor = el.selectionStart ?? 0;
    const value = el.value;

    // Walk backwards from the cursor to find a candidate `@`.
    let i = cursor - 1;
    let triggerIndex = -1;
    while (i >= 0) {
      const ch = value[i]!;
      if (ch === '@') {
        triggerIndex = i;
        break;
      }
      // Whitespace, newline, or `]` ends the search — no @ for this token.
      if (/\s/.test(ch) || ch === ']') break;
      i--;
    }
    if (triggerIndex < 0) return setState(EMPTY);

    // The `@` must be at start-of-string or after whitespace.
    const before = triggerIndex === 0 ? '' : value[triggerIndex - 1];
    if (before && !/\s/.test(before)) return setState(EMPTY);

    const query = value.slice(triggerIndex + 1, cursor);
    // Disallow whitespace inside the query — closes the menu when the
    // user types a space.
    if (/\s/.test(query)) return setState(EMPTY);

    setState({ active: true, query, triggerIndex, cursor });
  }, [textareaRef]);

  const reset = useCallback(() => setState(EMPTY), []);

  // Sync with selection changes triggered by mouse/keyboard navigation.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const handler = () => recompute();
    el.addEventListener('keyup', handler);
    el.addEventListener('mouseup', handler);
    el.addEventListener('focus', handler);
    return () => {
      el.removeEventListener('keyup', handler);
      el.removeEventListener('mouseup', handler);
      el.removeEventListener('focus', handler);
    };
  }, [textareaRef, recompute]);

  return { state, recompute, reset };
}
