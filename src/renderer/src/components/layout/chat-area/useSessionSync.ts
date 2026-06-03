import {useCallback, useEffect, useRef, useState} from 'react';
import {loadFullSession} from '@/lib/sessions';
import {findProject, findProjectForPath} from '@/lib/projects';
import {getNewSessionStateDraft, patchNewSessionStateDraft} from '@/lib/new-session-draft';
import type {PermissionMode} from '@/lib/electron';
import type {useAiData} from '@/hooks/useAiData';

/**
 * Session metadata sync. Rehydrates CWD, title, permission mode, and model
 * picker state when switching sessions. For null (fresh chat), restores
 * from draft or falls back to project/global defaults.
 */
export function useSessionSync(
  sessionId: string | null,
  newSessionDefaultProjectId: string | null | undefined,
  aiData: ReturnType<typeof useAiData>,
  onCwdChange?: (cwd: string | undefined) => void,
) {
  const [cwd, setCwd] = useState<string | undefined>(undefined);
  const [title, setTitle] = useState<string>('New session');
  const [permissionMode, setPermissionMode] = useState<PermissionMode>('auto');
  const [autonomyLevel, setAutonomyLevel] = useState<number>(50);
  const [projectDefaultConnectionSlug, setProjectDefaultConnectionSlug] = useState<string>('');
  const [sessionConnectionSlug, setSessionConnectionSlug] = useState<string>('');
  const [sessionModel, setSessionModel] = useState<string>('');
  const [loadedSessionPickId, setLoadedSessionPickId] = useState<string | null>(null);

  const permissionModeRef = useRef<PermissionMode>('auto');
  const autonomyLevelRef = useRef<number>(50);
  const cwdRef = useRef<string | undefined>(undefined);
  const prevSessionIdRef = useRef<string | null | undefined>(undefined);
  const sessionModeLoadedRef = useRef(false);

  // Keep refs current
  permissionModeRef.current = permissionMode;
  autonomyLevelRef.current = autonomyLevel;
  cwdRef.current = cwd;

  useEffect(() => {
    const prevId = prevSessionIdRef.current;
    prevSessionIdRef.current = sessionId;

    // Leaving the null (new) slot → snapshot mode + cwd
    if (prevId === null) {
      patchNewSessionStateDraft({
        permissionMode: permissionModeRef.current,
        autonomyLevel: autonomyLevelRef.current,
        cwd: cwdRef.current,
      });
    }

    if (!sessionId) {
      // Fresh chat
      setTitle('New session');
      sessionModeLoadedRef.current = false;
      const projForFresh = findProject(newSessionDefaultProjectId);

      const d = getNewSessionStateDraft();
      const restoredCwd = d.cwd !== undefined ? d.cwd : (projForFresh?.rootPath ?? undefined);
      setCwd(restoredCwd);
      onCwdChange?.(restoredCwd);

      setPermissionMode(
        d.permissionMode ??
          projForFresh?.defaultPermissionMode ??
          aiData?.settings.defaultPermissionMode ??
          'auto',
      );
      setAutonomyLevel(
        d.autonomyLevel ??
          projForFresh?.defaultAutonomyLevel ??
          aiData?.settings.defaultAutonomyLevel ??
          50,
      );
      setProjectDefaultConnectionSlug(projForFresh?.defaultConnectionSlug ?? '');
      setSessionConnectionSlug('');
      setSessionModel('');
      setLoadedSessionPickId(null);
      return;
    }

    // Loading existing session
    setLoadedSessionPickId(null);
    sessionModeLoadedRef.current = false;
    setCwd(undefined);
    onCwdChange?.(undefined);

    let cancelled = false;
    loadFullSession(sessionId).then((data) => {
      if (cancelled || !data) return;
      setCwd(data.meta.workingDirectory);
      onCwdChange?.(data.meta.workingDirectory);
      setTitle(data.meta.title);
      
      const project = findProject(data.meta.projectId);
      setPermissionMode(
        data.meta.permissionMode ??
          project?.defaultPermissionMode ??
          aiData?.settings.defaultPermissionMode ??
          'auto',
      );
      setAutonomyLevel(
        data.meta.autonomyLevel ??
          project?.defaultAutonomyLevel ??
          aiData?.settings.defaultAutonomyLevel ??
          50,
      );
      setProjectDefaultConnectionSlug(project?.defaultConnectionSlug ?? '');
      setSessionConnectionSlug(data.meta.connectionSlug ?? '');
      setSessionModel(data.meta.model ?? '');
      setLoadedSessionPickId(data.meta.id);
      sessionModeLoadedRef.current = true;
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, newSessionDefaultProjectId]);

  // Folder selection on a fresh session should adopt the matching project's
  // defaults (mode + autonomy + connection). Without this, picking a folder
  // that belongs to a project leaves the global defaults in place. Existing
  // sessions keep their persisted values, so this only fires for the null slot.
  const handleCwdChange = useCallback(
    (next: string | undefined) => {
      setCwd(next);
      onCwdChange?.(next);

      if (sessionId) return; // Only fresh sessions re-derive config from cwd.

      const proj = findProjectForPath(next);
      const mode =
        proj?.defaultPermissionMode ??
        aiData?.settings.defaultPermissionMode ??
        'auto';
      const auto =
        proj?.defaultAutonomyLevel ??
        aiData?.settings.defaultAutonomyLevel ??
        50;

      setPermissionMode(mode);
      permissionModeRef.current = mode;
      setAutonomyLevel(auto);
      autonomyLevelRef.current = auto;
      setProjectDefaultConnectionSlug(proj?.defaultConnectionSlug ?? '');

      // Persist into the draft so the picks survive switching slots and don't
      // get clobbered by the fresh-session default-tracking effect below.
      patchNewSessionStateDraft({
        cwd: next,
        permissionMode: mode,
        autonomyLevel: auto,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessionId, aiData?.settings.defaultPermissionMode, aiData?.settings.defaultAutonomyLevel],
  );

  // Listen for permission mode changes from subprocess (e.g., plan → auto after approval)
  useEffect(() => {
    if (!sessionId) return;

    return window.api.planning.onPermissionModeChanged((eventSessionId, mode) => {
      if (eventSessionId === sessionId) {
        console.log(`[useSessionSync] Permission mode changed: ${permissionMode} → ${mode}`);
        setPermissionMode(mode);
        permissionModeRef.current = mode;
      }
    });
  }, [sessionId, permissionMode]);

  // For fresh chats, track project/global default changes
  useEffect(() => {
    if (sessionId) return;
    if (!aiData) return;
    const draft = getNewSessionStateDraft();
    const projForFresh = findProject(newSessionDefaultProjectId);

    if (!draft.permissionMode) {
      setPermissionMode(
        projForFresh?.defaultPermissionMode ??
          aiData.settings.defaultPermissionMode ??
          'auto',
      );
    }
    if (draft.autonomyLevel === undefined) {
      setAutonomyLevel(
        projForFresh?.defaultAutonomyLevel ??
          aiData.settings.defaultAutonomyLevel ??
          50,
      );
    }
  }, [sessionId, aiData?.settings.defaultPermissionMode, newSessionDefaultProjectId, aiData]);

  return {
    cwd,
    setCwd: handleCwdChange,
    title,
    permissionMode,
    setPermissionMode,
    autonomyLevel,
    setAutonomyLevel,
    projectDefaultConnectionSlug,
    sessionConnectionSlug,
    sessionModel,
    loadedSessionPickId,
    permissionModeRef,
    autonomyLevelRef,
  };
}
