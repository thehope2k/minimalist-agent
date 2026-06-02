import { File as FileIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FileSearchEntry } from '@/lib/electron';
import { HighlightedText } from '../shared/HighlightedText';

interface FileRowProps {
  entry: FileSearchEntry;
  query: string;
  active: boolean;
  dataIdx: number;
  onMouseEnter: () => void;
  onMouseDown: (e: React.MouseEvent) => void;
}

export function FileRow({
  entry,
  query,
  active,
  dataIdx,
  onMouseEnter,
  onMouseDown,
}: FileRowProps) {
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
      <FileIcon className="h-3.5 w-3.5 shrink-0 text-fg-subtle" strokeWidth={1.75} />
      <HighlightedText text={entry.name} query={query} className="text-sm text-fg" />
      {parent && (
        <span className="ml-auto truncate font-mono text-[11px] text-fg-subtle">
          {parent}
        </span>
      )}
    </div>
  );
}
