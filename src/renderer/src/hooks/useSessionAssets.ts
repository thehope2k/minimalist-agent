import { useEffect, useState } from 'react';
import type { LoadedExtension, LoadedSkill } from '@/lib/electron';
import { useCwd } from '@/contexts/CwdContext';

interface SessionAssets {
  skills: LoadedSkill[];
  extensions: LoadedExtension[];
}

const EMPTY: SessionAssets = { skills: [], extensions: [] };

/**
 * Skills and extensions available in the current session, merging user-tier
 * and project-tier assets for the active cwd.
 *
 * Reloads when the cwd changes. Caching is handled by the main process.
 */
export function useSessionAssets(): SessionAssets {
  const cwd = useCwd();
  const [assets, setAssets] = useState<SessionAssets>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    window.api.context
      .listAvailable(cwd)
      .then(({ skills, extensions }) => {
        if (!cancelled) setAssets({ skills, extensions });
      })
      .catch(() => {
        if (!cancelled) setAssets(EMPTY);
      });
    return () => {
      cancelled = true;
    };
  }, [cwd]);

  return assets;
}
