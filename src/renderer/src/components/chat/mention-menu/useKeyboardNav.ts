import { useEffect, useState } from 'react';
import type { MentionMenuHandle, MentionItem } from './types';

interface UseKeyboardNavParams {
  items: MentionItem[];
  query: string;
  handleRef?: React.RefObject<MentionMenuHandle | null>;
  listRef: React.RefObject<HTMLUListElement | null>;
  onSelect: (item: MentionItem) => void;
}

/**
 * Manages keyboard navigation state and imperative handle for parent-driven nav.
 * Handles ↑↓ navigation with wraparound, Enter to confirm, and scroll-into-view.
 */
export function useKeyboardNav({
  items,
  query,
  handleRef,
  listRef,
  onSelect,
}: UseKeyboardNavParams) {
  const [activeIdx, setActiveIdx] = useState(0);

  // Reset selection on items change.
  useEffect(() => {
    setActiveIdx(0);
  }, [items.length, query]);

  // Imperative handle — parent textarea drives nav.
  useEffect(() => {
    if (!handleRef) return;
    handleRef.current = {
      moveUp: () => {
        if (items.length === 0) return;
        setActiveIdx((i) => (i - 1 + items.length) % items.length);
      },
      moveDown: () => {
        if (items.length === 0) return;
        setActiveIdx((i) => (i + 1) % items.length);
      },
      confirm: () => {
        const item = items[activeIdx];
        if (item) {
          onSelect(item);
          return true;
        }
        return false;
      },
    };
  }, [handleRef, items, activeIdx, onSelect]);

  // Keep the active row scrolled into view.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const el = list.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx, listRef]);

  return { activeIdx, setActiveIdx };
}
