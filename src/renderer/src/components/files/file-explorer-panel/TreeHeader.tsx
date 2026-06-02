import { FolderOpen, X } from 'lucide-react';

interface TreeHeaderProps {
  cwd: string;
  onClose: () => void;
}

export function TreeHeader({ cwd, onClose }: TreeHeaderProps) {
  return (
    <div className="flex h-10 shrink-0 items-center border-b border-border px-3">
      <FolderOpen className="mr-2 h-4 w-4 text-fg-muted" />
      <h2 className="flex-1 truncate text-sm font-medium text-fg" title={cwd}>
        Files
      </h2>
      <button
        onClick={onClose}
        className="ml-2 rounded p-0.5 text-fg-subtle hover:bg-elevated hover:text-fg"
        aria-label="Close file explorer"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
