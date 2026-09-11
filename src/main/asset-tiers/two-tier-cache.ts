// Shared cache + merge logic for the user/project two-tier asset loaders
// (skills, extensions, agents). Keyed by cwd ('' = user-only); project tier
// always overrides user tier for the same slug.

export interface TwoTierCache<T> {
  get(cwd: string | undefined): T[] | undefined;
  set(cwd: string | undefined, items: T[]): void;
  invalidate(cwd?: string): void;
}

export function createTwoTierCache<T>(ttlMs: number): TwoTierCache<T> {
  const cacheMap = new Map<string, { items: T[]; ts: number }>();

  return {
    get(cwd) {
      const cached = cacheMap.get(cwd ?? '');
      if (cached && Date.now() - cached.ts < ttlMs) return cached.items;
      return undefined;
    },
    set(cwd, items) {
      cacheMap.set(cwd ?? '', { items, ts: Date.now() });
    },
    invalidate(cwd) {
      if (cwd) {
        cacheMap.delete('');
        cacheMap.delete(cwd);
      } else {
        cacheMap.clear();
      }
    },
  };
}

/** Merge user + project items by slug; project entries win on collision. */
export function mergeTiers<T extends { slug: string }>(
  userItems: T[],
  projectItems: T[],
): T[] {
  const bySlug = new Map<string, T>();
  for (const item of userItems) bySlug.set(item.slug, item);
  for (const item of projectItems) bySlug.set(item.slug, item);
  return Array.from(bySlug.values());
}
