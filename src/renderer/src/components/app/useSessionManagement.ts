import { useState, useRef, useEffect } from 'react';
import type { ProjectFilter, View } from '../layout/TopBar';
import { PROJECT_FILTER_KEY, type SeedSubmit } from './types';
import { useSessions } from '@/hooks/useSessions';
import { clearNewSessionStateDraft } from '@/lib/new-session-draft';

/**
 * Manages active session state, new session creation, seed submissions,
 * and streaming session tracking.
 */
export function useSessionManagement(
  view: View,
  setView: (v: View) => void,
  projectFilter: ProjectFilter,
  inSettings: boolean,
  inSkills: boolean,
  inAgents: boolean,
  inExtensions: boolean,
) {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [streamingSessionIds, setStreamingSessionIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const [seedSubmit, setSeedSubmit] = useState<SeedSubmit | null>(null);
  const intentNewChatRef = useRef(false);
  const sessions = useSessions();

  const handleNewSession = () => {
    intentNewChatRef.current = true;
    clearNewSessionStateDraft();
    setActiveSessionId(null);
    if (inSettings || inSkills || inAgents || inExtensions) setView('all');
  };

  // Return to the in-progress new-session slot WITHOUT wiping its draft
  // (mode / autonomy / cwd / picker). Used by the "New session" row that
  // appears while a draft exists and the user is viewing another session.
  // Sets the intent flag so the auto-select effect doesn't bounce us back
  // to the latest session.
  const handleResumeNewSession = () => {
    intentNewChatRef.current = true;
    setActiveSessionId(null);
    if (inSettings || inSkills || inAgents || inExtensions) setView('all');
  };

  const startSessionWithSubmission = (submit: SeedSubmit) => {
    intentNewChatRef.current = true;
    clearNewSessionStateDraft();
    setSeedSubmit(submit);
    setActiveSessionId(null);
    setView('all');
  };

  // Reset the "explicit new chat" flag once the chat materialises
  useEffect(() => {
    if (activeSessionId !== null) intentNewChatRef.current = false;
  }, [activeSessionId]);

  // Auto-select latest session when returning to 'all' view
  useEffect(() => {
    if (view !== 'all') return;
    if (activeSessionId !== null) return;
    if (intentNewChatRef.current) return;
    if (!sessions || sessions.length === 0) return;

    const latest = sessions
      .filter((s) => !s.archived)
      .filter((s) => {
        if (projectFilter === 'all') return true;
        if (projectFilter === 'inbox') return !s.projectId;
        return s.projectId === projectFilter;
      })
      .sort((a, b) => b.lastMessageAt - a.lastMessageAt)[0];

    if (latest) setActiveSessionId(latest.id);
  }, [view, activeSessionId, sessions, projectFilter]);

  return {
    activeSessionId,
    setActiveSessionId,
    streamingSessionIds,
    setStreamingSessionIds,
    seedSubmit,
    setSeedSubmit,
    handleNewSession,
    handleResumeNewSession,
    startSessionWithSubmission,
    sessions,
  };
}

/**
 * Manages project filter persistence in localStorage.
 */
export function useProjectFilter() {
  const [projectFilter, setProjectFilter] = useState<ProjectFilter>(() => {
    try {
      return (localStorage.getItem(PROJECT_FILTER_KEY) as ProjectFilter) || 'all';
    } catch {
      return 'all';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(PROJECT_FILTER_KEY, projectFilter);
    } catch {
      /* ignore quota / disabled storage */
    }
  }, [projectFilter]);

  return { projectFilter, setProjectFilter };
}
