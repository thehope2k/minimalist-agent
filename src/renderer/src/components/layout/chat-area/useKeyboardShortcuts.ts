import { useState, useEffect, useRef } from 'react';

/**
 * Keyboard shortcuts for Git modal (Cmd+G), Search (double Shift), and
 * Recent Files (Cmd+E).
 */
export function useKeyboardShortcuts(
  shortcutsEnabled: boolean,
  activeSession: string | null,
  cwd: string | undefined,
) {
  const [gitModalOpen, setGitModalOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [recentOpen, setRecentOpen] = useState(false);
  const lastShiftTs = useRef<number>(0);

  // Git diff modal - Cmd/Ctrl+G
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

  // Search Everything - Double Shift
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

  // Recent Files - Cmd+E
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

  return {
    gitModalOpen,
    setGitModalOpen,
    searchOpen,
    setSearchOpen,
    recentOpen,
    setRecentOpen,
  };
}
