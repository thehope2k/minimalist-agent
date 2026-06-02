import { File as FileIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ContentMatchEntry } from '@/lib/electron';
import { SnippetLine } from './SnippetLine';

interface GrepRowProps {
  entry: ContentMatchEntry;
  query: string;
  active: boolean;
  dataIdx: number;
  onMouseEnter: () => void;
  onMouseDown: (e: React.MouseEvent) => void;
}

export function GrepRow({
  entry,
  query,
  active,
  dataIdx,
  onMouseEnter,
  onMouseDown,
}: GrepRowProps) {
  const filename = entry.relativePath.split('/').pop() ?? entry.relativePath;
  const dir = entry.relativePath.includes('/')
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
          <span className="ml-auto truncate font-mono text-[11px] text-fg-subtle">
            {dir}
          </span>
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
