/**
 * Keyboard shortcuts for the chat area:
 *   Cmd+G        — Git diff modal
 *   Double Shift — Search everywhere palette
 *   Cmd+E        — Recent files palette
 *   Cmd+F        — Find in chat history (inline find bar)
 *
 * ── Cmd+F conflict resolution ─────────────────────────────────────────────
 *
 * Three components in the app want to handle Cmd+F, each with different
 * preconditions. They resolve by layered priority:
 *
 *   Priority 1 — Terminal (TerminalPanel.tsx)
 *     Registered with { capture: true } + stopPropagation(), fires when
 *     terminal panel is open AND focus is not in a text field. Terminal search
 *     is the intended target when the panel is open and the user is not
 *     actively composing a message.
 *
 *   Priority 2 — File explorer (useKeyboardNav.ts)
 *     Registered without capture; guarded by
 *     containerRef.current.contains(document.activeElement). Fires only when
 *     the explorer panel itself has keyboard focus. No conflict because the
 *     guard is tight.
 *
 *   Priority 3 — Chat find (this hook)
 *     Registered without capture (bubble phase). Because the terminal handler
 *     now calls stopPropagation(), it never reaches here when the terminal
 *     panel is open. When the terminal is closed (or focus is in a text field),
 *     the terminal handler skips, and this handler fires.
 *
 * ── Re-pressing Cmd+F when bar is already open ────────────────────────────
 *
 * Re-pressing Cmd+F when the find bar is already open re-focuses the search
 * input and selects all text (rather than toggling the bar closed). This
 * matches the behaviour of browser find-in-page (Cmd+F in Chrome/Safari).
 * The findInputRef is forwarded to FindBar's <input> for this purpose.
 */

import { useState, useEffect, useRef } from 'react';

export function useKeyboardShortcuts(
  shortcutsEnabled: boolean,
  activeSession: string | null,
  cwd: string | undefined,
) {
  const [gitModalOpen, setGitModalOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [recentOpen, setRecentOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const lastShiftTs = useRef<number>(0);

  /**
   * Ref to the find bar's text input. Forwarded to FindBar via ChatContent so
   * that pressing Cmd+F when the bar is already open re-focuses the input
   * rather than toggling it closed.
   */
  const findInputRef = useRef<HTMLInputElement>(null);

  // Git diff modal — Cmd/Ctrl+G
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!shortcutsEnabled) return;
      if (!activeSession) return;
      if (!cwd) return;
      if ((e.metaKey || e.ctrlKey) && e.key === 'g' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        setGitModalOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [shortcutsEnabled, activeSession, cwd]);

  // Search Everything — Double Shift
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Shift' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const now = Date.now();
        const delta = now - lastShiftTs.current;
        if (delta > 0 && delta < 300) {
          e.preventDefault();
          setSearchOpen((v) => !v);
          lastShiftTs.current = 0;
        } else {
          lastShiftTs.current = now;
        }
      } else {
        lastShiftTs.current = 0;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Recent Files — Cmd+E
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'e' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        setRecentOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Find in chat — Cmd/Ctrl+F
  //
  // Registered without { capture: true } (bubble phase) so that the terminal's
  // capture-phase handler with stopPropagation() takes priority when the
  // terminal panel is open. When the terminal is closed, the terminal handler
  // returns early on its `if (!isOpenRef.current) return` guard, the event
  // bubbles normally, and this handler fires.
  //
  // The file explorer's Cmd+F is guarded by containerRef.contains(activeElement),
  // so it only fires when the explorer itself has focus — no overlap here.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!shortcutsEnabled) return;
      if (!((e.metaKey || e.ctrlKey) && e.key === 'f' && !e.shiftKey && !e.altKey)) return;

      e.preventDefault();

      if (findOpen) {
        // Bar is already visible — re-focus the input and select all text.
        // Selecting all lets the user immediately type a new search term
        // without manually clearing the previous one (matches browser behaviour).
        findInputRef.current?.focus();
        findInputRef.current?.select();
      } else {
        setFindOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [shortcutsEnabled, findOpen]);

  return {
    gitModalOpen,
    setGitModalOpen,
    searchOpen,
    setSearchOpen,
    recentOpen,
    setRecentOpen,
    findOpen,
    setFindOpen,
    findInputRef,
  };
}
