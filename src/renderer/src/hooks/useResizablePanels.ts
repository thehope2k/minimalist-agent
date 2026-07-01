import { useCallback, useMemo } from 'react';
import type { Layout } from 'react-resizable-panels';
import * as storage from '@/lib/local-storage';

/**
 * Persist and restore a resizable panel group layout.
 *
 * @param key          Storage key suffix (must be unique per group).
 * @param panelIds     Ordered list of panel `id` props that match the JSX.
 * @param defaultSizes Initial percentage sizes (0–100) used when no valid
 *                     saved layout exists.
 */
export function useResizablePanels(
  key: string,
  panelIds: string[],
  defaultSizes: number[],
) {
  const defaultLayout = useMemo<Layout | undefined>(() => {
    const saved = storage.get<Layout | null>(storage.KEYS.panelLayout, null, key);
    if (!saved || typeof saved !== 'object') return undefined;

    // All panel ids must be present.
    if (!panelIds.every((id) => id in saved)) return undefined;

    // Discard corrupted entries (values must be percentages summing to ~100).
    const values = panelIds.map((id) => saved[id] ?? 0);
    const sum = values.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 100) >= 10) {
      storage.remove(storage.KEYS.panelLayout, key);
      return undefined;
    }

    return saved;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onLayoutChange = useCallback(
    (layout: Layout) => {
      // Only persist — no React state update to avoid re-renders during drag.
      storage.set(storage.KEYS.panelLayout, layout, key);
    },
    [key],
  );

  // v4 treats plain numbers as pixels — always return percentage strings.
  const defaultSizesFromLayout: string[] = defaultLayout
    ? panelIds.map((id) => `${defaultLayout[id] ?? defaultSizes[panelIds.indexOf(id)]}%`)
    : defaultSizes.map((s) => `${s}%`);

  return { defaultLayout, defaultSizesFromLayout, onLayoutChange };
}
