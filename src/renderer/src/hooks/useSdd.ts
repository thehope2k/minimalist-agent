import { useCallback, useEffect, useRef, useState } from 'react';
import type { SddMappingPatch, SddSessionState } from '@/lib/sdd';

/**
 * Synthetic session ID used when no real session exists yet but a cwd is
 * known. Allows the SDD panel to scan and display entities/features on a
 * new-session screen before the first message is sent. Cleaned up as soon
 * as a real session ID arrives.
 */
const DRAFT_SID = '__draft__';

/**
 * Central hook for all SDD state in a session.
 * Initiates the workspace scan, subscribes to artifact-change events,
 * and exposes setMapping / setMode / refreshScan.
 */
export function useSdd(
  sessionId: string | null,
  cwd: string | undefined,
  sddMode: 'auto' | 'off' = 'off',
) {
  const [state, setState] = useState<SddSessionState | null>(null);
  const [loading, setLoading] = useState(false);
  const lastSessionId = useRef<string | null>(null);
  const lastCwd = useRef<string | undefined>(undefined);

  // Use a draft ID when there's no real session yet but we have a cwd to
  // scan. This lets the workspace panel show SDD context before first send.
  const effectiveSid = sessionId ?? (cwd ? DRAFT_SID : null);

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

  // Initial scan and re-scan on session/cwd change.
  // Uses effectiveSid so a draft scan fires even before the first message.
  useEffect(() => {
    if (!effectiveSid || !cwd) {
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
    const sessionChanged = effectiveSid !== lastSessionId.current;

    // Clean up the previous session's (or draft's) watchers before a new scan.
    if ((sessionChanged || cwdChanged) && lastSessionId.current) {
      void window.api.sdd.cleanupSession(lastSessionId.current);
    }

    lastSessionId.current = effectiveSid;
    lastCwd.current = cwd;

    if (sessionChanged || cwdChanged) {
      void runScan(effectiveSid, cwd, sddMode);
    }
  }, [effectiveSid, cwd, sddMode, runScan]);

  // Re-run scan when sddMode changes (Off → Auto triggers immediate scan)
  useEffect(() => {
    if (!effectiveSid || !cwd) return;
    if (sddMode === 'off') {
      setState(null);
    } else {
      void runScan(effectiveSid, cwd, sddMode);
    }
  }, [sddMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Subscribe to artifact-changed and state-changed events from watcher/CWD change
  useEffect(() => {
    if (!effectiveSid) return;
    const unsubArtifact = window.api.sdd.onArtifactChanged((changedSessionId) => {
      if (changedSessionId !== effectiveSid) return;
      void window.api.sdd.getSessionState(effectiveSid).then((fresh) => {
        if (fresh) setState(fresh);
      });
    });
    // Listen for state-changed (fired on CWD change)
    const stateChangedCb = (changedSessionId: string) => {
      if (changedSessionId !== effectiveSid) return;
      if (cwd) void runScan(effectiveSid, cwd, sddMode);
    };
    const unsubState = window.api.sdd.onStateChanged?.(stateChangedCb);
    return () => {
      unsubArtifact();
      unsubState?.();
    };
  }, [effectiveSid, cwd, sddMode, runScan]);

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
      // Use effectiveSid so toggling Auto on a new session triggers a scan.
      const sid = sessionId ?? (cwd ? DRAFT_SID : null);
      if (!sid) return;
      await window.api.sdd.setMode(sid, mode);
      if (mode === 'off') {
        setState(null);
        // Stop FS watchers — no point watching when SDD is disabled.
        // initSessionState will restart them if re-enabled.
        void window.api.sdd.cleanupSession(sid);
      } else if (cwd) {
        void runScan(sid, cwd, mode);
      }
    },
    [sessionId, cwd, runScan],
  );

  const refreshScan = useCallback(() => {
    const sid = sessionId ?? (cwd ? DRAFT_SID : null);
    if (!sid || !cwd) return;
    void runScan(sid, cwd, sddMode);
  }, [sessionId, cwd, sddMode, runScan]);

  return { state, loading, setMapping, setMode, setActiveFeature, refreshScan };
}
