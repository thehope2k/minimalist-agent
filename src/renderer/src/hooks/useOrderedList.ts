// Applies a user-defined, persisted order on top of a live list (skills,
// agents, extensions) that otherwise arrives in filesystem order. The
// persisted order is just a list of ids — items are looked up against it
// live, so new/removed items merge in without ever going stale.

import { useCallback, useMemo, useState } from 'react';
import { get, set, KEYS } from '@/lib/local-storage';

export type ListOrderKind = 'skills' | 'agents' | 'extensions';

interface OrderedList<T> {
  ordered: T[] | null;
  reorder: (newItems: T[]) => void;
}

function reconcileOrder<T>(
  items: T[],
  order: string[],
  getId: (item: T) => string,
): T[] {
  const remaining = new Map(items.map((item) => [getId(item), item]));
  const result: T[] = [];

  for (const id of order) {
    const item = remaining.get(id);
    if (!item) continue;
    result.push(item);
    remaining.delete(id);
  }

  for (const item of items) {
    if (remaining.has(getId(item))) result.push(item);
  }

  return result;
}

export function useOrderedList<T>(
  items: T[] | null,
  kind: ListOrderKind,
  getId: (item: T) => string,
): OrderedList<T> {
  const [order, setOrder] = useState<string[]>(() =>
    get<string[]>(KEYS.listOrder, [], kind),
  );

  const ordered = useMemo(
    // getId must stay a module-level constant at call sites (getSkillId,
    // getAgentId, getExtensionId) — an inline arrow here would change
    // identity every render and defeat this memo.
    () => (items ? reconcileOrder(items, order, getId) : null),
    [items, order, getId],
  );

  const reorder = useCallback(
    (newItems: T[]) => {
      const ids = newItems.map(getId);
      set(KEYS.listOrder, ids, kind);
      setOrder(ids);
    },
    [kind, getId],
  );

  return { ordered, reorder };
}
