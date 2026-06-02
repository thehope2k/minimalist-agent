// Recent Files palette — opened with Cmd+E.
//
// Shows the 30 most recently opened files, most recent first.
// Typing narrows the list with a simple case-insensitive substring match
// on both filename and full path.
//
// Keyboard:
//   ↑/↓   — move highlight
//   Enter — open highlighted result
//   Esc   — close (parent listener)
//   click — open clicked result
//
// The same mouseMovedRef guard used in SearchModal is applied here so
// Enter always opens the keyboard-highlighted row, not whatever the
// cursor happens to be hovering over.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock, File as FileIcon, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { list as listRecent, clear as clearRecent } from '@/lib/recent-files';
import type { RecentFile } from '@/lib/recent-files';
import { HighlightedText } from './shared/HighlightedText';

export interface RecentFilesModalProps {
  onClose:    () => void;
  onOpenFile: (absolutePath: string, lineNumber: number) => void;
}

// ─── path helpers (no node:path in renderer) ─────────────────────────────────
function basename(p: string): string { return p.split('/').pop() ?? p; }
function dirname(p: string): string {
  const idx = p.lastIndexOf('/');
  return idx > 0 ? p.slice(0, idx) : '';
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RecentFilesModal({ onClose, onOpenFile }: RecentFilesModalProps) {
  const [query,     setQuery]     = useState('');
  const [entries,   setEntries]   = useState<RecentFile[]>(() => listRecent());
  const [activeIdx, setActiveIdx] = useState(0);

  const inputRef      = useRef<HTMLInputElement>(null);
  const listRef       = useRef<HTMLDivElement>(null);
  const mouseMovedRef = useRef(false);

  // Autofocus on open.
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Esc closes (capture so it wins over any other Esc handler).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, [onClose]);

  // ── Filtered list ──────────────────────────────────────────────────────────
  const filtered = useMemo<RecentFile[]>(() => {
    if (!query.trim()) return entries;
    const q = query.toLowerCase();
    return entries.filter(
      (e) =>
        e.absolutePath.toLowerCase().includes(q) ||
        basename(e.absolutePath).toLowerCase().includes(q),
    );
  }, [entries, query]);

  // Reset highlight + mouse guard when query or list changes.
  useEffect(() => {
    setActiveIdx(0);
    mouseMovedRef.current = false;
  }, [query, filtered.length]);

  // Scroll active row into view.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  function openEntry(entry: RecentFile) {
    onOpenFile(entry.absolutePath, entry.lineNumber);
  }

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const entry = filtered[activeIdx];
        if (entry) openEntry(entry);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, activeIdx],
  );

  const handleClear = () => {
    clearRecent();
    setEntries([]);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-black/60 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="relative flex w-[min(92vw,560px)] flex-col overflow-hidden rounded-xl border border-border bg-panel shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
          <Clock className="h-4 w-4 shrink-0 text-fg-subtle" strokeWidth={1.75} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Recent files…"
            spellCheck={false}
            autoComplete="off"
            className="flex-1 bg-transparent text-sm text-fg placeholder:text-fg-subtle focus:outline-none"
          />
          {entries.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              title="Clear recent files"
              className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-fg-subtle transition-colors hover:bg-elevated hover:text-fg"
            >
              <X className="h-3 w-3" strokeWidth={1.75} />
              Clear
            </button>
          )}
          <kbd className="shrink-0 rounded border border-border/60 px-1.5 py-0.5 font-mono text-[10px] text-fg-subtle">
            esc
          </kbd>
        </div>

        {/* ── Result list ── */}
        <div
          ref={listRef}
          className="max-h-[54vh] overflow-y-auto scroll-thin pb-1"
          onMouseMove={() => { mouseMovedRef.current = true; }}
        >
          {filtered.length === 0 ? (
            <div className="flex items-center justify-center py-9">
              <p className="text-xs text-fg-subtle">
                {entries.length === 0
                  ? 'No recent files yet — open a file from Search Everywhere'
                  : `No files match "${query}"`}
              </p>
            </div>
          ) : (
            filtered.map((entry, i) => (
              <RecentRow
                key={entry.absolutePath}
                entry={entry}
                query={query}
                active={i === activeIdx}
                dataIdx={i}
                onMouseEnter={() => { if (mouseMovedRef.current) setActiveIdx(i); }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  openEntry(entry);
                }}
              />
            ))
          )}
        </div>

        {/* ── Hint bar ── */}
        <div className="flex shrink-0 items-center gap-1 border-t border-border/40 px-4 py-2">
          <span className="text-[10px] text-fg-subtle">
            <Key>↑↓</Key> navigate &nbsp;·&nbsp; <Key>↵</Key> open
            &nbsp;·&nbsp; <Key>⌘E</Key> toggle
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function RecentRow({
  entry,
  query,
  active,
  dataIdx,
  onMouseEnter,
  onMouseDown,
}: {
  entry:        RecentFile;
  query:        string;
  active:       boolean;
  dataIdx:      number;
  onMouseEnter: () => void;
  onMouseDown:  (e: React.MouseEvent) => void;
}) {
  const name = basename(entry.absolutePath);
  const dir  = dirname(entry.absolutePath);

  return (
    <div
      data-idx={dataIdx}
      onMouseEnter={onMouseEnter}
      onMouseDown={onMouseDown}
      className={cn(
        'flex cursor-pointer items-center gap-2.5 px-3 py-1.5',
        active ? 'bg-elevated' : 'hover:bg-elevated/60',
      )}
    >
      <FileIcon className="h-3.5 w-3.5 shrink-0 text-fg-subtle" strokeWidth={1.75} />

      {/* Filename with query highlight */}
      <HighlightedText text={name} query={query} className="shrink-0 text-sm text-fg" />

      {/* Line number badge — only when the file was opened at a specific line */}
      {entry.lineNumber > 1 && (
        <span className="shrink-0 rounded bg-elevated-2 px-1 font-mono text-[10px] text-fg-muted">
          L{entry.lineNumber}
        </span>
      )}

      {/* Directory path */}
      {dir && (
        <span className="ml-auto truncate font-mono text-[11px] text-fg-subtle">
          <HighlightedText text={dir} query={query} />
        </span>
      )}
    </div>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border/60 px-1 font-mono">{children}</kbd>
  );
}
