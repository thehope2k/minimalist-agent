// Accept-action pill buttons for a single conflict block.
// Rendered into a Monaco contentWidget DOM node via ReactDOM.createRoot.

import { cn } from '@/lib/utils';

interface ConflictBlockWidgetProps {
  blockIndex: number;
  totalBlocks: number;
  onAcceptOurs: () => void;
  onAcceptTheirs: () => void;
  onAcceptBoth: () => void;
  onIgnore: () => void;
}

export function ConflictBlockWidget({
  blockIndex,
  totalBlocks,
  onAcceptOurs,
  onAcceptTheirs,
  onAcceptBoth,
  onIgnore,
}: ConflictBlockWidgetProps) {
  const btn = (label: string, color: string, onClick: () => void) => (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={cn(
        'rounded px-2 py-0.5 text-[10px] font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent',
        color,
      )}
    >
      {label}
    </button>
  );

  return (
    <div
      className="flex items-center gap-1 px-2 py-1 font-sans"
      // Prevent Monaco from swallowing mouse events on the widget.
      onMouseDown={(e) => e.stopPropagation()}
    >
      <span className="mr-1 text-[10px] text-fg-subtle tabular-nums">
        {blockIndex + 1}/{totalBlocks}
      </span>
      {btn('Accept Ours', 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25', onAcceptOurs)}
      {btn('Accept Theirs', 'bg-blue-500/15 text-blue-300 hover:bg-blue-500/25', onAcceptTheirs)}
      {btn('Accept Both', 'bg-elevated text-fg-muted hover:bg-elevated-2', onAcceptBoth)}
      {btn('Ignore', 'text-fg-subtle hover:text-fg hover:bg-elevated', onIgnore)}
    </div>
  );
}
