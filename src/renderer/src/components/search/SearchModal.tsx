import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { useFileSearch } from './search-modal/useFileSearch';
import { useGrepSearch } from './search-modal/useGrepSearch';
import { useSearchResults } from './search-modal/useSearchResults';
import { FileRow } from './search-modal/FileRow';
import { GrepRow } from './search-modal/GrepRow';
import { SectionHeader, EmptyHint, Key } from './search-modal/SearchUI';
import type { SearchModalProps, SearchItem } from './search-modal/types';

/**
 * Unified "Search Everywhere" palette — File + content search.
 * Orchestrates keyboard navigation across both result types.
 */
export function SearchModal({ cwd, onClose, onOpenFile }: SearchModalProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Data loading
  const fileResults = useFileSearch(cwd, query);
  const { grepResults, grepLoading } = useGrepSearch(cwd, query);

  // Results + keyboard navigation
  const {
    filteredFiles,
    items,
    activeIdx,
    mouseMovedRef,
    setActiveIdx,
    handleKeyDown,
  } = useSearchResults(fileResults, grepResults, query);

  // Autofocus input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Esc to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, [onClose]);

  // Scroll active row into view
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-idx="${activeIdx}"]`,
    );
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  function openItem(item: SearchItem) {
    if (item.kind === 'file') {
      onOpenFile(item.entry.absolutePath, 1);
    } else {
      onOpenFile(item.entry.absolutePath, item.entry.lineNumber);
    }
  }

  const noCwd = !cwd;
  const noResults = filteredFiles.length === 0 && grepResults.length === 0;
  const hasQuery = query.trim().length > 0;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-black/60 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="relative flex w-[min(92vw,680px)] flex-col overflow-hidden rounded-xl border border-border bg-panel shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-fg-subtle" strokeWidth={1.75} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, openItem)}
            placeholder={
              cwd ? 'Search files and content…' : 'No working directory set'
            }
            disabled={noCwd}
            spellCheck={false}
            autoComplete="off"
            className="flex-1 bg-transparent text-sm text-fg placeholder:text-fg-subtle focus:outline-none disabled:opacity-50"
          />
          {grepLoading && (
            <Loader2
              className="h-3.5 w-3.5 shrink-0 animate-spin text-fg-subtle"
              strokeWidth={1.75}
            />
          )}
          <kbd className="shrink-0 rounded border border-border/60 px-1.5 py-0.5 font-mono text-[10px] text-fg-subtle">
            esc
          </kbd>
        </div>

        {/* Result list */}
        <div
          ref={listRef}
          className="max-h-[54vh] overflow-y-auto scroll-thin pb-1"
          onMouseMove={() => {
            mouseMovedRef.current = true;
          }}
        >
          {noCwd ? (
            <EmptyHint>
              Set a working directory for this session to use Search
            </EmptyHint>
          ) : (
            <>
              {/* Files section */}
              {filteredFiles.length > 0 && (
                <>
                  <SectionHeader label="Files" />
                  {filteredFiles.map((entry, i) => (
                    <FileRow
                      key={entry.absolutePath}
                      entry={entry}
                      query={query}
                      active={i === activeIdx}
                      dataIdx={i}
                      onMouseEnter={() => {
                        if (mouseMovedRef.current) setActiveIdx(i);
                      }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        openItem({ kind: 'file', entry });
                      }}
                    />
                  ))}
                </>
              )}

              {/* In-files section */}
              {grepResults.length > 0 && (
                <>
                  <SectionHeader label="In files" />
                  {grepResults.map((entry, i) => {
                    const idx = filteredFiles.length + i;
                    return (
                      <GrepRow
                        key={`${entry.absolutePath}:${entry.lineNumber}`}
                        entry={entry}
                        query={query}
                        active={idx === activeIdx}
                        dataIdx={idx}
                        onMouseEnter={() => {
                          if (mouseMovedRef.current) setActiveIdx(idx);
                        }}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          openItem({ kind: 'grep', entry });
                        }}
                      />
                    );
                  })}
                </>
              )}

              {/* Empty states */}
              {noResults && !grepLoading && hasQuery && (
                <EmptyHint>No results for &ldquo;{query}&rdquo;</EmptyHint>
              )}
              {noResults && !hasQuery && (
                <EmptyHint>Type to search files and content</EmptyHint>
              )}
            </>
          )}
        </div>

        {/* Hint bar */}
        <div className="flex shrink-0 items-center gap-1 border-t border-border/40 px-4 py-2">
          <span className="text-[10px] text-fg-subtle">
            <Key>↑↓</Key> navigate &nbsp;·&nbsp; <Key>↵</Key> open
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
