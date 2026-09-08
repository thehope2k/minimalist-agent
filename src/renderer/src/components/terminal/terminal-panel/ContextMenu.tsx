import { cn } from '@/lib/utils';

interface TerminalContextMenuProps {
  x:            number;
  y:            number;
  hasSelection: boolean;
  onCopy:       () => void;
  onPaste:      () => void;
  onClear:      () => void;
  onClose:      () => void;
}

export function TerminalContextMenu({
  x,
  y,
  hasSelection,
  onCopy,
  onPaste,
  onClear,
  onClose,
}: TerminalContextMenuProps) {
  return (
    <>
      {/* Invisible backdrop to close on outside click */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 min-w-[140px] overflow-hidden rounded-lg border border-border bg-panel py-1 shadow-2xl"
        style={{ left: x, top: y }}
      >
        {hasSelection && <ContextMenuItem label="Copy" onClick={onCopy} />}
        <ContextMenuItem label="Paste" onClick={onPaste} />
        <div className="my-1 h-px bg-border/50" />
        <ContextMenuItem label="Clear" onClick={onClear} />
      </div>
    </>
  );
}

function ContextMenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center px-3 py-1.5 text-left text-sm text-fg',
        'hover:bg-elevated transition-colors',
      )}
    >
      {label}
    </button>
  );
}
