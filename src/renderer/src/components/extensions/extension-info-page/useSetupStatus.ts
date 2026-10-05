import { useCallback, useEffect, useState } from 'react';
import { reload as reloadExtensions } from '@/lib/extensions';
import type { ExtensionSetupSnapshot } from '@/lib/electron';

export function useSetupStatus(extensionPath: string) {
  const [snapshot, setSnapshot] = useState<ExtensionSetupSnapshot | null>(null);

  const refresh = useCallback(async () => {
    setSnapshot(await window.api.extensions.setupStatus(extensionPath));
  }, [extensionPath]);

  useEffect(() => {
    setSnapshot(null);
    void refresh();
    return window.api.extensions.onMcpStatus(() => void refresh());
  }, [refresh]);

  const apply = useCallback(
    async (change: () => Promise<unknown>) => {
      await change();
      await refresh();
      await reloadExtensions();
    },
    [refresh],
  );

  return { snapshot, apply };
}
