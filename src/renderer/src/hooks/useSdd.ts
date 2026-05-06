import { useCallback, useEffect, useRef, useState } from 'react';
import type { SddMappingPatch, SddSessionState } from '@/lib/sdd';

/**
 * Central hook for all SDD state in a session.
 * Initiates the workspace scan, subscribes to artifact-change events,
 * and exposes setMapping / setMode / refreshScan.
 */
export function useSdd(
  sessionId: string | null,
  cwd: string | undefined,
  sddMode: 'auto' | 'off' = 'auto',
) {
  const [state, setState] = useState<SddSessionState | null>(null);
  const [loading, setLoading] = useState(false);
  const lastSessionId = useRef<string | null>(null);
  const lastCwd = useRef<string | undefined>(undefined);

  const runScan = useCallback(
    async (sid: string, dir: string, mode: 'auto' | 'off') => {
      if (mode === 'off') {
        setState(null);
        return;
      }
      setLoading(true);
      try {
        const result = await window.api.sdd.initSessionState(sid, dir, mode);
        // Guard against stale results: if the user switched sessions while this
        // scan was in flight, discard the result — don't overwrite the newer
        // session's state (race condition when switching quickly, BUG-SDD-07).
        if (sid !== lastSessionId.current || dir !== lastCwd.current) return;
        setState(result);
      } catch (e) {
        console.error('[sdd] scan failed', e);
        if (sid === lastSessionId.current) setState(null);
      } finally {
        // Only clear the spinner for the scan that is still current.
        if (sid === lastSessionId.current) setLoading(false);
      }
    },
    [],
  );

  // Initial scan and re-scan on session/cwd change
  useEffect(() => {
    if (!sessionId || !cwd) {
      setState(null);
      // Reset refs so that when a real session resumes, sessionChanged is true
      // and the scan re-runs. Without this, switching A → new → A would leave
      // lastSessionId as 'A', making sessionChanged false on return and
      // skipping the scan — leaving the panel in the empty state (BUG-SDD-06).
      lastSessionId.current = null;
      lastCwd.current = undefined;
      return;
    }
    const cwdChanged = cwd !== lastCwd.current;
    const sessionChanged = sessionId !== lastSessionId.current;

    // Clean up the previous session's watchers before starting a new scan
    if ((sessionChanged || cwdChanged) && lastSessionId.current) {
      void window.api.sdd.cleanupSession(lastSessionId.current);
    }

    lastSessionId.current = sessionId;
    lastCwd.current = cwd;

    if (sessionChanged || cwdChanged) {
      void runScan(sessionId, cwd, sddMode);
    }
  }, [sessionId, cwd, sddMode, runScan]);

  // Re-run scan when sddMode changes (Off → Auto triggers immediate scan)
  useEffect(() => {
    if (!sessionId || !cwd) return;
    if (sddMode === 'off') {
      setState(null);
    } else {
      void runScan(sessionId, cwd, sddMode);
    }
  }, [sddMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Subscribe to artifact-changed and state-changed events from watcher/CWD change
  useEffect(() => {
    if (!sessionId) return;
    const unsubArtifact = window.api.sdd.onArtifactChanged((changedSessionId) => {
      if (changedSessionId !== sessionId) return;
      void window.api.sdd.getSessionState(sessionId).then((fresh) => {
        if (fresh) setState(fresh);
      });
    });
    // Listen for state-changed (fired on CWD change)
    const stateChangedCb = (changedSessionId: string) => {
      if (changedSessionId !== sessionId) return;
      if (cwd) void runScan(sessionId, cwd, sddMode);
    };
    const unsubState = window.api.sdd.onStateChanged?.(stateChangedCb);
    return () => {
      unsubArtifact();
      unsubState?.();
    };
  }, [sessionId, cwd, sddMode, runScan]);

  const setMapping = useCallback(
    async (patch: SddMappingPatch) => {
      if (!sessionId) return;
      const updated = await window.api.sdd.setMapping(sessionId, patch);
      if (updated) setState(updated);
    },
    [sessionId],
  );

  const setActiveFeature = useCallback(
    async (slug: string | null) => {
      if (!sessionId) return;
      const updated = await window.api.sdd.setActiveFeature(sessionId, slug);
      if (updated) setState(updated);
    },
    [sessionId],
  );

  const setMode = useCallback(
    async (mode: 'auto' | 'off') => {
      if (!sessionId) return;
      await window.api.sdd.setMode(sessionId, mode);
      if (mode === 'off') {
        setState(null);
        // Stop FS watchers — no point watching when SDD is disabled.
        // initSessionState will restart them if re-enabled.
        void window.api.sdd.cleanupSession(sessionId);
      } else if (cwd) {
        void runScan(sessionId, cwd, mode);
      }
    },
    [sessionId, cwd, runScan],
  );

  const refreshScan = useCallback(() => {
    if (!sessionId || !cwd) return;
    void runScan(sessionId, cwd, sddMode);
  }, [sessionId, cwd, sddMode, runScan]);

  return { state, loading, setMapping, setMode, setActiveFeature, refreshScan };
}
