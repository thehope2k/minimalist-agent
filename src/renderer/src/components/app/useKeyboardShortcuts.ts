import { useEffect, useRef, type RefObject } from 'react';
import type { PanelImperativeHandle } from 'react-resizable-panels';
import type { View } from '../layout/TopBar';
import { deleteSession } from '@/lib/sessions';

type SessionListEntry = NonNullable<ReturnType<typeof import('@/hooks/useSessions').useSessions>>[number];

/**
 * Global keyboard shortcuts:
 * - Cmd+T: Toggle terminal
 * - Cmd+B: Toggle file explorer
 * - Cmd+Shift+B: Toggle context panel
 * - Cmd+N: New session
 * - Cmd+S: Jump to sessions view
 * - Cmd+,: Jump to settings
 * - Cmd+Delete: Delete active session
 * - Cmd+Shift+↑/↓: Resize terminal (when terminal open, not in text field)
 */
export function useKeyboardShortcuts(
  view: View,
  setView: (v: View) => void,
  toggleTerminal: () => void,
  toggleFileExplorer: () => void,
  toggleContextPanel: () => void,
  handleNewSession: () => void,
  terminalOpenRef: RefObject<boolean>,
  terminalPanelRef: RefObject<PanelImperativeHandle | null>,
  activeSessionId: string | null,
  sessions: SessionListEntry[] | null,
) {
  const activeSessionIdRef = useRef(activeSessionId);
  const sessionsRef = useRef(sessions);
  const handleNewSessionRef = useRef(handleNewSession);

  activeSessionIdRef.current = activeSessionId;
  sessionsRef.current = sessions;
  handleNewSessionRef.current = handleNewSession;

  useEffect(() => {
    const isTextInput = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      // xterm.js focuses an internal textarea for key capture
      if (t.tagName === 'TEXTAREA' && t.closest('.xterm')) return false;
      return (
        t.tagName === 'INPUT' ||
        t.tagName === 'TEXTAREA' ||
        t.isContentEditable
      );
    };

    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      // Cmd+T — toggle terminal (sessions/chat view only)
      if (e.key === 't' && !e.shiftKey && !e.altKey) {
        if (view === 'settings' || view === 'skills' || view === 'agents' || view === 'extensions') return;
        e.preventDefault();
        toggleTerminal();
        return;
      }

      // Cmd+B — toggle file explorer (sessions/chat view only)
      if (e.key === 'b' && !e.shiftKey && !e.altKey) {
        if (view === 'settings' || view === 'skills' || view === 'agents' || view === 'extensions') return;
        e.preventDefault();
        toggleFileExplorer();
        return;
      }

      // Cmd+Shift+B — toggle context panel (sessions/chat view only)
      if (e.key === 'b' && e.shiftKey && !e.altKey) {
        if (view === 'settings' || view === 'skills' || view === 'agents' || view === 'extensions') return;
        e.preventDefault();
        toggleContextPanel();
        return;
      }

      // Cmd+N — new session
      if (e.key === 'n' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        handleNewSessionRef.current();
        return;
      }

      // Cmd+S — jump to Sessions view
      if (e.key === 's' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        setView('all');
        return;
      }

      // Cmd+, — jump to Settings view
      if (e.key === ',' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        setView('settings');
        return;
      }

      // Cmd+Delete — delete active session
      if (e.key === 'Backspace' && !e.shiftKey && !e.altKey) {
        const sid = activeSessionIdRef.current;
        if (!sid) return;
        if (isTextInput(e)) return;
        e.preventDefault();
        const session = sessionsRef.current?.find((s) => s.id === sid);
        const label = session?.title?.trim() || 'this session';
        if (!window.confirm(`Delete "${label}"? This cannot be undone.`)) return;
        void deleteSession(sid).then(() => {
          // App.tsx will handle resetting activeSessionId via setActiveSessionId(null)
        });
        return;
      }

      // Resize shortcuts — only when terminal open and not in text field
      if (!terminalOpenRef.current || isTextInput(e)) return;

      const RESIZE_STEP = 3;
      if (e.key === 'ArrowUp' && e.shiftKey && !e.altKey) {
        e.preventDefault();
        const p = terminalPanelRef.current;
        if (p) p.resize(`${Math.min(p.getSize().asPercentage + RESIZE_STEP, 70)}%`);
        return;
      }
      if (e.key === 'ArrowDown' && e.shiftKey && !e.altKey) {
        e.preventDefault();
        const p = terminalPanelRef.current;
        if (p) p.resize(`${Math.max(p.getSize().asPercentage - RESIZE_STEP, 15)}%`);
        return;
      }
    };

    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, [toggleTerminal, toggleFileExplorer, toggleContextPanel, view, setView, terminalOpenRef, terminalPanelRef]);
}
