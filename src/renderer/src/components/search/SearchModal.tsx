// Unified "Search Everywhere" palette — opened with Double Shift.
//
// Mirrors IntelliJ's Search Everywhere: one input, results from two
// sources appear as progressive sections in a single list.
//
//   "Files"    — fuzzy filename search, instant (reuses files:search IPC)
//   "In files" — full-text/regex content grep, debounced 250 ms (files:grep IPC)
//
// Selecting any result closes this palette and opens FileViewModal.
// The parent (ChatArea) owns the viewFile state — SearchModal fires
// onOpenFile(absolutePath, lineNumber) and lets ChatArea mount the viewer.
//
// Keyboard:
//   ↑/↓     — move highlight through all results (across both sections)
//   Enter   — open highlighted result
//   Esc     — close palette (handled by window listener)
//   click   — open clicked result

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { File as FileIcon, Folder as FolderIcon, Search, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { searchFiles, scoreEntry } from '@/lib/files';
import type { FileSearchEntry } from '@/lib/electron';
import type { ContentMatchEntry } from '@/lib/electron';

export interface SearchModalProps {
  cwd: string | undefined;
  onClose: () => void;
  /** Called when the user picks a result. Parent handles opening FileViewModal. */
  onOpenFile: (absolutePath: string, lineNumber: number) => void;
}

type SearchItem =
  | { kind: 'file'; entry: FileSearchEntry }
  | { kind: 'grep'; entry: ContentMatchEntry };

const FILES_LIMIT        = 20;
const GREP_LIMIT         = 60;
const FILES_DEBOUNCE_MS  = 150;
const GREP_DEBOUNCE_MS   = 250;

export function SearchModal({ cwd, onClose, onOpenFile }: SearchModalProps) {
  const [query, setQuery]           = useState('');
  const [fileResults, setFiles]     = useState<FileSearchEntry[]>([]);
  const [grepResults, setGrep]      = useState<ContentMatchEntry[]>([]);
  const [grepLoading, setGrepLoad]  = useState(false);
  const [activeIdx, setActiveIdx]   = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef  = useRef<HTMLDivElement>(null);

  // Autofocus the input immediately on open.
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Esc closes the palette. Registered in capture so it fires before any
  // other Esc listeners (e.g. ExpandModal on the file viewer).
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

  // ── File search (debounced 150 ms) ────────────────────────────────────────
  useEffect(() => {
    if (!cwd) { setFiles([]); return; }
    let cancelled = false;
    const t = window.setTimeout(() => {
      void searchFiles(cwd, query, FILES_LIMIT).then((res) => {
        if (!cancelled) setFiles(res);
      });
    }, FILES_DEBOUNCE_MS);
    return () => { cancelled = true; window.clearTimeout(t); };
  }, [cwd, query]);

  // ── Grep search (debounced 250 ms, only when there's a query) ─────────────
  useEffect(() => {
    if (!cwd || !query.trim()) { setGrep([]); setGrepLoad(false); return; }
    let cancelled = false;
    setGrepLoad(true);
    const t = window.setTimeout(() => {
      window.api.files
        .grep({ root: cwd, query: query.trim(), limit: GREP_LIMIT })
        .then((res) => { if (!cancelled) { setGrep(res); setGrepLoad(false); } })
        .catch(() => { if (!cancelled) { setGrep([]); setGrepLoad(false); } });
    }, GREP_DEBOUNCE_MS);
    return () => { cancelled = true; window.clearTimeout(t); };
  }, [cwd, query]);

  // ── Client-side scoring/filtering of file results ─────────────────────────
  const filteredFiles = useMemo<FileSearchEntry[]>(() => {
    if (!query.trim()) return fileResults.slice(0, FILES_LIMIT);
    return fileResults
      .map((e) => ({ entry: e, score: scoreEntry(e, query) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, FILES_LIMIT)
      .map((x) => x.entry);
  }, [fileResults, query]);

  // ── Flat item list for keyboard nav ───────────────────────────────────────
  const items: SearchItem[] = useMemo(() => [
    ...filteredFiles.map((entry) => ({ kind: 'file' as const, entry })),
    ...grepResults.map((entry)   => ({ kind: 'grep' as const, entry })),
  ], [filteredFiles, grepResults]);

  // Reset active index whenever the result set changes.
  useEffect(() => { setActiveIdx(0); }, [items.length, query]);

  // Scroll active row into view.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  function openItem(item: SearchItem) {
    if (item.kind === 'file') {
      onOpenFile(item.entry.absolutePath, 1);
    } else {
      onOpenFile(item.entry.absolutePath, item.entry.lineNumber);
    }
  }

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = items[activeIdx];
      if (item) openItem(item);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, activeIdx]);

  const noCwd      = !cwd;
  const noResults  = filteredFiles.length === 0 && grepResults.length === 0;
  const hasQuery   = query.trim().length > 0;

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
        {/* ── Search input ── */}
        <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-fg-subtle" strokeWidth={1.75} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={cwd ? 'Search files and content…' : 'No working directory set'}
            disabled={noCwd}
            spellCheck={false}
            autoComplete="off"
            className="flex-1 bg-transparent text-sm text-fg placeholder:text-fg-subtle focus:outline-none disabled:opacity-50"
          />
          {grepLoading && (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-fg-subtle" strokeWidth={1.75} />
          )}
          <kbd className="shrink-0 rounded border border-border/60 px-1.5 py-0.5 font-mono text-[10px] text-fg-subtle">
            esc
          </kbd>
        </div>

        {/* ── Result list ── */}
        <div
          ref={listRef}
          className="max-h-[54vh] overflow-y-auto scroll-thin pb-1"
        >
          {noCwd ? (
            <EmptyHint>Set a working directory for this session to use Search</EmptyHint>
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
                      onMouseEnter={() => setActiveIdx(i)}
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
                        onMouseEnter={() => setActiveIdx(idx)}
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

        {/* ── Hint bar ── */}
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="sticky top-0 z-10 border-b border-border/60 bg-panel/95 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-fg-subtle backdrop-blur">
      {label}
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center py-9">
      <p className="text-xs text-fg-subtle">{children}</p>
    </div>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border/60 px-1 font-mono">{children}</kbd>
  );
}

function FileRow({
  entry, query, active, dataIdx, onMouseEnter, onMouseDown,
}: {
  entry: FileSearchEntry;
  query: string;
  active: boolean;
  dataIdx: number;
  onMouseEnter: () => void;
  onMouseDown: (e: React.MouseEvent) => void;
}) {
  const Icon   = entry.type === 'directory' ? FolderIcon : FileIcon;
  const parent = entry.relativePath.includes('/')
    ? entry.relativePath.slice(0, entry.relativePath.lastIndexOf('/'))
    : null;

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
      <Icon
        className={cn(
          'h-3.5 w-3.5 shrink-0',
          entry.type === 'directory' ? 'text-fg-muted' : 'text-fg-subtle',
        )}
        strokeWidth={1.75}
      />
      <HighlightedText text={entry.name} query={query} className="text-sm text-fg" />
      {parent && (
        <span className="ml-auto truncate font-mono text-[11px] text-fg-subtle">
          {parent}
        </span>
      )}
    </div>
  );
}

function GrepRow({
  entry, query, active, dataIdx, onMouseEnter, onMouseDown,
}: {
  entry: ContentMatchEntry;
  query: string;
  active: boolean;
  dataIdx: number;
  onMouseEnter: () => void;
  onMouseDown: (e: React.MouseEvent) => void;
}) {
  const filename = entry.relativePath.split('/').pop() ?? entry.relativePath;
  const dir      = entry.relativePath.includes('/')
    ? entry.relativePath.slice(0, entry.relativePath.lastIndexOf('/'))
    : null;

  return (
    <div
      data-idx={dataIdx}
      onMouseEnter={onMouseEnter}
      onMouseDown={onMouseDown}
      className={cn(
        'cursor-pointer px-3 py-1.5',
        active ? 'bg-elevated' : 'hover:bg-elevated/60',
      )}
    >
      {/* File + line */}
      <div className="flex items-center gap-2">
        <FileIcon className="h-3.5 w-3.5 shrink-0 text-fg-subtle" strokeWidth={1.75} />
        <span className="text-sm text-fg">{filename}</span>
        <span className="rounded bg-elevated-2 px-1 font-mono text-[10px] text-fg-muted">
          L{entry.lineNumber}
        </span>
        {dir && (
          <span className="ml-auto truncate font-mono text-[11px] text-fg-subtle">{dir}</span>
        )}
      </div>
      {/* Snippet with match highlight */}
      <div className="mt-0.5 pl-6 font-mono text-[11px] text-fg-subtle truncate">
        <SnippetLine
          lineContent={entry.lineContent}
          matchStart={entry.matchStart}
          matchEnd={entry.matchEnd}
        />
      </div>
    </div>
  );
}

/** Highlight the matched substring in a filename. */
function HighlightedText({
  text, query, className,
}: {
  text: string;
  query: string;
  className?: string;
}) {
  if (!query.trim()) return <span className={className}>{text}</span>;

  const lower = text.toLowerCase();
  const idx   = lower.indexOf(query.toLowerCase());
  if (idx === -1) return <span className={className}>{text}</span>;

  return (
    <span className={className}>
      {text.slice(0, idx)}
      <mark className="bg-transparent font-semibold text-accent">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </span>
  );
}

/** Render a grep match line with the match region highlighted. */
function SnippetLine({
  lineContent, matchStart, matchEnd,
}: {
  lineContent: string;
  matchStart: number;
  matchEnd: number;
}) {
  const trimmed = lineContent.trimStart();
  const trimOffset = lineContent.length - trimmed.length;
  const start = Math.max(0, matchStart - trimOffset);
  const end   = Math.max(0, matchEnd   - trimOffset);

  if (start >= end || start >= trimmed.length) {
    return <>{trimmed}</>;
  }

  return (
    <>
      {trimmed.slice(0, start)}
      <mark className="bg-transparent font-semibold text-accent">{trimmed.slice(start, end)}</mark>
      {trimmed.slice(end)}
    </>
  );
}
