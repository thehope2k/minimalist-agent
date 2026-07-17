import { useState, useEffect, useCallback } from 'react';
import type { LoadedSkill, LoadedExtension } from '@/lib/electron';

export type ContextScope = 'user' | 'project';

export interface AvailableAssets {
  skills: LoadedSkill[];
  extensions: LoadedExtension[];
}

interface UseContextPanelProps {
  sessionId: string | null;
  cwd?: string;
  pinnedAssets?: string[];
}

export function useContextPanel({ sessionId, cwd, pinnedAssets }: UseContextPanelProps) {
  const [available, setAvailable] = useState<AvailableAssets>({ skills: [], extensions: [] });
  const [tokenEstimate, setTokenEstimate] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  // Optimistic local copy of pinned slugs — updated immediately on pin/unpin
  // so the UI responds instantly without waiting for the parent reload cycle.
  const [localPinned, setLocalPinned] = useState<Set<string>>(
    () => new Set(pinnedAssets ?? []),
  );

  // Reconcile when the authoritative prop arrives (after reloadSessions).
  useEffect(() => {
    setLocalPinned(new Set(pinnedAssets ?? []));
  }, [pinnedAssets]);

  const refresh = useCallback(async (invalidate = false) => {
    setLoading(true);
    try {
      const result = await window.api.context.listAvailable(cwd, invalidate);
      setAvailable({
        skills: result.skills as LoadedSkill[],
        extensions: result.extensions as LoadedExtension[],
      });
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [cwd]);

  // Auto-load on mount / cwd change (uses cache)
  useEffect(() => {
    void refresh(false);
  }, [refresh]);

  // Re-estimate tokens when pinned assets change
  useEffect(() => {
    if (localPinned.size === 0) {
      setTokenEstimate(0);
      return;
    }
    window.api.context.estimateTokens([...localPinned], cwd).then(setTokenEstimate).catch(() => {});
  }, [localPinned, cwd]);

  const pin = useCallback(async (scopedSlug: string) => {
    if (!sessionId) return;
    setLocalPinned((prev) => new Set([...prev, scopedSlug])); // optimistic
    await window.api.context.pin(sessionId, scopedSlug);
  }, [sessionId]);

  const unpin = useCallback(async (scopedSlug: string) => {
    if (!sessionId) return;
    setLocalPinned((prev) => { const next = new Set(prev); next.delete(scopedSlug); return next; }); // optimistic
    await window.api.context.unpin(sessionId, scopedSlug);
  }, [sessionId]);

  const isPinned = useCallback((scope: ContextScope, slug: string): boolean => {
    return localPinned.has(`${scope}:${slug}`);
  }, [localPinned]);

  // Split available into project + user groups
  const projectSkills = available.skills.filter((s) => s.source === 'project');
  const userSkills = available.skills.filter((s) => s.source === 'user');
  const projectExtensions = available.extensions.filter((e) => e.scope === 'project');
  const userExtensions = available.extensions.filter((e) => e.scope === 'user');

  // Pinned items resolved from available — use localPinned for instant UI response
  const pinnedSkills = available.skills.filter((s) =>
    localPinned.has(`${s.source}:${s.slug}`),
  );

  const TOKEN_WARNING_THRESHOLD = 2000;

  return {
    loading,
    available,
    projectSkills,
    userSkills,
    projectExtensions,
    userExtensions,
    pinnedSkills,
    tokenEstimate,
    tokenWarning: tokenEstimate > TOKEN_WARNING_THRESHOLD,
    pin,
    unpin,
    isPinned,
    refresh,
  };
}
