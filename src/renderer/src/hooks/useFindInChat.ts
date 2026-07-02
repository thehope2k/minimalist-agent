/**
 * useFindInChat — search and navigation logic for the chat find bar.
 *
 * Responsibilities:
 *   - Accepts a ref to the chat scroll container so that mark.js is scoped
 *     exclusively to the message list DOM, leaving header, input, and sidebars
 *     untouched.
 *   - Debounces the search query (120 ms) so marks are not redrawn on every
 *     keystroke, keeping the highlight feel instant without thrashing the DOM
 *     on fast typists.
 *   - Maintains a live array of every <mark> element produced by the current
 *     search, used to navigate between matches with smooth scrolling.
 *   - Removes all marks cleanly on close or when the query is cleared, so
 *     the DOM is left exactly as it was before the find bar opened.
 *
 * What mark.js does:
 *   mark.js walks all text nodes inside the root element, wraps every
 *   substring match in a <mark data-markjs="true"> element, and invokes
 *   callbacks for match count and completion. It handles case-insensitive
 *   search, diacritics, and works correctly across complex DOM structures
 *   including rendered Markdown, code blocks, and nested elements.
 *
 * What this hook does NOT do:
 *   - It does not search inside <canvas> elements (Mermaid diagrams render
 *     to SVG text which IS traversed, but xterm.js canvas is not). Terminal
 *     output lives in a separate panel entirely.
 *   - It does not persist the query across sessions or navigation — the find
 *     bar is ephemeral per open/close cycle.
 *   - It does not highlight as you type inside code blocks differently than
 *     prose — all text nodes are treated the same.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Mark from 'mark.js';

/** Delay in ms between the last keystroke and the mark.js search pass. */
const DEBOUNCE_MS = 120;

export interface FindInChatControls {
  /** Total number of matches for the current query (0 when query is empty). */
  matchCount: number;
  /**
   * 1-based index of the currently highlighted match, or 0 when there are no
   * matches or the query is blank. Displayed as "X / Y" in the find bar.
   */
  activeIndex: number;
  /** Advance to the next match, wrapping around from the last to the first. */
  next: () => void;
  /** Go back to the previous match, wrapping around from the first to the last. */
  prev: () => void;
  /**
   * Remove all highlights and reset state. Called on find bar close and on
   * query clear. Safe to call when no marks are present.
   */
  clear: () => void;
}

/**
 * Manages find-in-chat state and DOM highlighting for a given scroll container.
 *
 * @param containerRef - Ref to the scrollable <div> that wraps the message list.
 *   mark.js will be scoped to this node. When the ref is null (e.g. before
 *   first render or after unmount) all operations are no-ops.
 * @param query - The current search string from the find bar input.
 * @param isOpen - Whether the find bar is visible. Marks are cleared when this
 *   transitions from true to false.
 */
export function useFindInChat(
  containerRef: React.RefObject<HTMLElement | null>,
  query: string,
  isOpen: boolean,
): FindInChatControls {
  const [matchCount, setMatchCount] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);

  /**
   * Stable ref to the mark.js instance. Recreated whenever the container
   * changes; kept in a ref so callbacks from debounced timers always see
   * the latest instance without needing to be deps of the debounce effect.
   */
  const markerRef = useRef<Mark | null>(null);

  /**
   * Live array of <mark> DOM elements for the current query, in document
   * order. Rebuilt on every successful mark pass. Used to locate and scroll
   * to the active match.
   */
  const marksRef = useRef<HTMLElement[]>([]);

  /** Active match index (0-based internally, exposed as 1-based). */
  const activeIdxRef = useRef<number>(0);

  /** Debounce timer handle. Cleared on every query change to coalesce calls. */
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Mark.js instance management ────────────────────────────────────────────

  // Recreate the Mark instance whenever the container ref's DOM node changes.
  // In practice the node is stable for the lifetime of the chat area, so this
  // only fires once after the first real render.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    markerRef.current = new Mark(el);
  }, [containerRef]);

  // ── Highlighting ────────────────────────────────────────────────────────────

  /**
   * Navigate to a specific match index (0-based). Removes the 'find-active'
   * class from the previous match, adds it to the new one, and smoothly
   * scrolls it into the vertical centre of the viewport so the user can see
   * full context around the match.
   */
  const activateMatch = useCallback((idx: number) => {
    const marks = marksRef.current;
    if (marks.length === 0) return;

    // Clamp and wrap the index — keeps both next() and prev() simple.
    const clamped = ((idx % marks.length) + marks.length) % marks.length;

    // Remove highlight from old active match.
    if (activeIdxRef.current >= 0 && activeIdxRef.current < marks.length) {
      marks[activeIdxRef.current].classList.remove('find-active');
    }

    marks[clamped].classList.add('find-active');
    activeIdxRef.current = clamped;
    setActiveIndex(clamped + 1); // expose as 1-based

    marks[clamped].scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  /**
   * Run a mark.js search pass for the given query string. Clears any previous
   * marks first, then wraps matches, collects the resulting <mark> nodes, and
   * activates the first one.
   */
  const runSearch = useCallback(
    (searchQuery: string) => {
      const marker = markerRef.current;
      if (!marker) return;

      // Always start clean — mark.js is safe to call unmark() on an already
      // unmarked context.
      marker.unmark({
        done: () => {
          marksRef.current = [];
          activeIdxRef.current = 0;
          setActiveIndex(0);

          if (!searchQuery.trim()) {
            setMatchCount(0);
            return;
          }

          const collected: HTMLElement[] = [];

          marker.mark(searchQuery, {
            separateWordSearch: false,
            caseSensitive: false,
            // Collect each newly created <mark> element in document order.
            each: (el) => collected.push(el as HTMLElement),
            done: (count) => {
              marksRef.current = collected;
              setMatchCount(count);
              if (count > 0) {
                activateMatch(0);
              }
            },
          });
        },
      });
    },
    [activateMatch],
  );

  // ── Debounced query reaction ────────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) return;

    // Cancel any in-flight debounce so only the latest query wins.
    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      runSearch(query);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    };
  }, [query, isOpen, runSearch]);

  // ── Clear on close ─────────────────────────────────────────────────────────

  const clear = useCallback(() => {
    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    markerRef.current?.unmark();
    marksRef.current = [];
    activeIdxRef.current = 0;
    setMatchCount(0);
    setActiveIndex(0);
  }, []);

  // Clean up marks whenever the find bar closes.
  useEffect(() => {
    if (!isOpen) {
      clear();
    }
  }, [isOpen, clear]);

  // ── Navigation ──────────────────────────────────────────────────────────────

  const next = useCallback(() => {
    activateMatch(activeIdxRef.current + 1);
  }, [activateMatch]);

  const prev = useCallback(() => {
    activateMatch(activeIdxRef.current - 1);
  }, [activateMatch]);

  return { matchCount, activeIndex, next, prev, clear };
}
