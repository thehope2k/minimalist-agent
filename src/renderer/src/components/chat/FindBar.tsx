/**
 * FindBar — the inline find-in-chat toolbar.
 *
 * Appears at the top of the chat scroll area (between the ChatHeader and the
 * message list) when the user presses Cmd/Ctrl+F. Disappears with Escape or
 * the close button, and leaves no marks in the DOM after close.
 *
 * Layout (single horizontal row):
 *   [ 🔍  search input ··················· ][ X / Y ][ ↑ ][ ↓ ][ ✕ ]
 *
 * Keyboard behaviour within the bar:
 *   Enter / ArrowDown   → next match
 *   Shift+Enter / ArrowUp → previous match
 *   Escape              → close (restores focus to the element that was active
 *                         before the bar opened)
 *   Cmd+F               → already-open: re-focuses the input and selects all
 *                         text (handled in the parent via the inputRef prop)
 *
 * The component is intentionally free of business logic — it only forwards
 * user actions (query changes, next/prev, close) to its props. All highlight
 * and navigation state lives in the useFindInChat hook.
 *
 * Animation:
 *   The bar slides down from zero height using a CSS translate transition so
 *   that it does not cause layout reflows during the slide (transform is
 *   GPU-composited). The transition matches the 150 ms used by other overlay
 *   animations in the app.
 */

import { useEffect, useRef } from 'react';
import { Search, X, ChevronUp, ChevronDown } from 'lucide-react';
import { IconButton } from '@/components/ui';
import { cn } from '@/lib/utils';

export interface FindBarProps {
  /** Whether the bar is currently visible. Controls the slide-in animation. */
  open: boolean;
  /** Current value of the search input. */
  query: string;
  /** Called on every keystroke so the parent can update query state. */
  onQueryChange: (q: string) => void;
  /** Total number of matches for the current query. */
  matchCount: number;
  /**
   * 1-based index of the currently highlighted match. 0 means no active match
   * (query empty or no results).
   */
  activeIndex: number;
  /** Navigate to the next match. */
  onNext: () => void;
  /** Navigate to the previous match. */
  onPrev: () => void;
  /** Close the find bar and restore prior focus. */
  onClose: () => void;
  /**
   * Forwarded ref to the text input. The parent holds this ref so that
   * pressing Cmd+F when the bar is already open can re-focus and select the
   * input text rather than closing and reopening the bar.
   */
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

export function FindBar({
  open,
  query,
  onQueryChange,
  matchCount,
  activeIndex,
  onNext,
  onPrev,
  onClose,
  inputRef,
}: FindBarProps) {
  // Internal ref used when the parent does not supply one.
  const internalRef = useRef<HTMLInputElement>(null);
  const resolvedRef = (inputRef ?? internalRef) as React.RefObject<HTMLInputElement | null>;

  // Auto-focus the input whenever the bar opens.
  useEffect(() => {
    if (open) {
      // rAF defers focus until after the slide-in paint frame so the browser
      // doesn't snap the scroll position before the animation completes.
      const id = requestAnimationFrame(() => {
        resolvedRef.current?.focus();
        resolvedRef.current?.select();
      });
      return () => cancelAnimationFrame(id);
    }
  }, [open, resolvedRef]);

  // Keyboard shortcuts within the bar itself.
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        onPrev();
      } else {
        onNext();
      }
      return;
    }
    // ArrowDown / ArrowUp as secondary navigation shortcuts — familiar from
    // browser DevTools and VS Code find widgets.
    if (e.key === 'ArrowDown' && !e.shiftKey) {
      e.preventDefault();
      onNext();
      return;
    }
    if (e.key === 'ArrowUp' && !e.shiftKey) {
      e.preventDefault();
      onPrev();
      return;
    }
  };

  // Derive the counter label.
  // "0 results" when query is non-empty but nothing matched; blank when query
  // is empty (no point showing "0 / 0" with an empty input).
  const showCounter = query.trim().length > 0;
  const counterLabel =
    matchCount === 0 ? 'No results' : `${activeIndex} / ${matchCount}`;
  const noResults = showCounter && matchCount === 0;

  return (
    // The outer wrapper controls visibility height so that when closed the
    // bar takes no space and the message list flows naturally to the top.
    // overflow-hidden clips the sliding child during animation.
    <div
      className={cn(
        'overflow-hidden transition-all duration-150',
        open ? 'max-h-12 opacity-100' : 'max-h-0 opacity-0',
      )}
      aria-hidden={!open}
    >
      <div className="flex items-center gap-2 border-b border-border bg-panel px-3 py-2">
        {/* Search icon — decorative, not interactive. */}
        <Search
          className="size-3.5 shrink-0 text-fg-subtle"
          aria-hidden
        />

        {/* Query input — fills remaining space. placeholder nudges the user
            toward a search term without cluttering the bar when focused. */}
        <input
          ref={resolvedRef}
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Find in chat…"
          spellCheck={false}
          autoComplete="off"
          aria-label="Find in chat"
          aria-live="polite"
          aria-atomic="true"
          className={cn(
            'min-w-0 flex-1 bg-transparent text-sm outline-none',
            'placeholder:text-fg-subtle',
            noResults ? 'text-red-400' : 'text-fg',
          )}
        />

        {/* Match counter — shown only when there is a non-empty query. */}
        {showCounter && (
          <span
            className={cn(
              'shrink-0 select-none text-xs tabular-nums',
              noResults ? 'text-red-400' : 'text-fg-muted',
            )}
          >
            {counterLabel}
          </span>
        )}

        {/* Navigation buttons — disabled when there are no matches. */}
        <div className="flex items-center">
          <IconButton
            icon={ChevronUp}
            label="Previous match (Shift+Enter)"
            onClick={onPrev}
            disabled={matchCount === 0}
            className="size-6 rounded text-fg-muted hover:bg-elevated hover:text-fg disabled:opacity-30"
          />
          <IconButton
            icon={ChevronDown}
            label="Next match (Enter)"
            onClick={onNext}
            disabled={matchCount === 0}
            className="size-6 rounded text-fg-muted hover:bg-elevated hover:text-fg disabled:opacity-30"
          />
        </div>

        {/* Close button — always enabled. */}
        <IconButton
          icon={X}
          label="Close find bar (Escape)"
          onClick={onClose}
          className="size-6 rounded text-fg-muted hover:bg-elevated hover:text-fg"
        />
      </div>
    </div>
  );
}
