import { useEffect, useState } from 'react';
import { GitBranch, X, FolderTree, Layers } from 'lucide-react';
import { IconButton } from '@/components/ui';
import { ExportMenu } from '@/components/chat/session-export/ExportMenu';
import { BrowserStatusPill } from './BrowserStatusPill';

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
    <header className="relative flex h-10 shrink-0 items-center border-b border-border px-4">
      <div className="mx-auto flex w-full max-w-240 items-center pr-28">
        <h2 className="w-full min-w-0 truncate text-[15px] font-semibold text-fg">{title}</h2>
      </div>
      <div className="absolute right-4 top-1/2 flex -translate-y-1/2 items-center gap-1">
        <BrowserStatusPill sessionId={sessionId} />
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
