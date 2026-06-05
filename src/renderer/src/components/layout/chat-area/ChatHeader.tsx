import { GitBranch, X, FolderTree } from 'lucide-react';
import { IconButton } from '@/components/ui';
import { ExportMenu } from '@/components/chat/session-export/ExportMenu';

type Props = {
  title: string;
  sessionId: string | null;
  onNewSession: () => void;
  onOpenGit: () => void;
  onToggleFileExplorer?: () => void;
  fileExplorerOpen?: boolean;
};

export function ChatHeader({
  title,
  sessionId,
  onNewSession,
  onOpenGit,
  onToggleFileExplorer,
  fileExplorerOpen,
}: Props) {
  return (
    <header className="flex h-10 shrink-0 items-center justify-between border-b border-border px-4">
      <div className="flex-1" />
      <div className="flex items-center gap-2 max-w-120">
        <h2 className="truncate text-[15px] font-semibold text-fg">{title}</h2>
      </div>
      <div className="flex flex-1 items-center justify-end gap-1">
        {onToggleFileExplorer && (
          <IconButton
            icon={FolderTree}
            label="File Explorer (Cmd+B)"
            onClick={onToggleFileExplorer}
            className={fileExplorerOpen ? 'bg-accent/15 text-accent' : undefined}
          />
        )}
        <IconButton icon={GitBranch} label="Git changes (Cmd+G)" onClick={onOpenGit} />
        <ExportMenu sessionId={sessionId} />
        <IconButton icon={X} label="New" onClick={onNewSession} />
      </div>
    </header>
  );
}
