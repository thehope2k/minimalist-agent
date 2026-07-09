import { useEffect, useState } from 'react';
import { GitBranch, X, FolderTree, Layers } from 'lucide-react';
import { IconButton } from '@/components/ui';
import { ExportMenu } from '@/components/chat/session-export/ExportMenu';

type Props = {
  title: string;
  sessionId: string | null;
  onNewSession: () => void;
  onOpenGit: () => void;
  onToggleFileExplorer?: () => void;
  fileExplorerOpen?: boolean;
  onToggleContextPanel?: () => void;
  contextPanelOpen?: boolean;
  cwd?: string;
};

export function ChatHeader({
  title,
  sessionId,
  onNewSession,
  onOpenGit,
  onToggleFileExplorer,
  fileExplorerOpen,
  onToggleContextPanel,
  contextPanelOpen,
  cwd,
}: Props) {
  const [hasProjectAssets, setHasProjectAssets] = useState(false);

  useEffect(() => {
    if (!cwd) { setHasProjectAssets(false); return; }
    window.api.context.hasProjectAssets(cwd)
      .then(setHasProjectAssets)
      .catch(() => setHasProjectAssets(false));
  }, [cwd]);

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
        {onToggleContextPanel && (
          <div className="relative">
            <IconButton
              icon={Layers}
              label="Context panel (Cmd+Shift+B)"
              onClick={onToggleContextPanel}
              className={contextPanelOpen ? 'bg-accent/15 text-accent' : undefined}
            />
            {hasProjectAssets && !contextPanelOpen && (
              <span
                className="pointer-events-none absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-accent"
                aria-hidden
              />
            )}
          </div>
        )}
        <IconButton icon={GitBranch} label="Git changes (Cmd+G)" onClick={onOpenGit} />
        <ExportMenu sessionId={sessionId} />
        <IconButton icon={X} label="New" onClick={onNewSession} />
      </div>
    </header>
  );
}
