import type { ComponentProps } from 'react';
import { ContextPanel } from '../context/ContextPanel';
import { FileExplorerPanel } from '../files';
import { BrowserPanel } from '../browser/BrowserPanel';
import type { ActiveSidePanel } from './usePanelStates';
import { reload as reloadSessions, type SessionMeta } from '@/lib/sessions';

interface AppSidePanelProps {
  activeSidePanel: ActiveSidePanel;
  activeCwd: string | undefined;
  activeSessionId: string | null;
  fileExplorerOpen: boolean;
  sessions: SessionMeta[] | null;
  onOpenFile: (absolutePath: string, lineNumber: number) => void;
  onToggleFileExplorer: () => void;
  onToggleContextPanel: () => void;
  onToggleBrowserPanel: () => void;
  startSessionWithSubmission: ComponentProps<typeof ContextPanel>['onStartChatWithSubmission'];
}

export function AppSidePanel({
  activeSidePanel,
  activeCwd,
  activeSessionId,
  fileExplorerOpen,
  sessions,
  onOpenFile,
  onToggleFileExplorer,
  onToggleContextPanel,
  onToggleBrowserPanel,
  startSessionWithSubmission,
}: AppSidePanelProps) {
  if (activeSidePanel === 'browser') {
    return <BrowserPanel sessionId={activeSessionId} onHidePanel={onToggleBrowserPanel} />;
  }

  if (activeSidePanel === 'explorer') {
    return (
      <FileExplorerPanel
        cwd={activeCwd}
        sessionId={activeSessionId}
        isOpen={fileExplorerOpen}
        onSelectFile={(absolutePath) => onOpenFile(absolutePath, 1)}
        onClose={onToggleFileExplorer}
      />
    );
  }

  if (activeSidePanel === 'context') {
    return (
      <ContextPanel
        sessionId={activeSessionId}
        cwd={activeCwd}
        pinnedAssets={sessions?.find((session) => session.id === activeSessionId)?.pinnedAssets}
        onPinnedChange={() => {
          void reloadSessions();
        }}
        onStartChatWithSubmission={startSessionWithSubmission}
        onClose={onToggleContextPanel}
        onOpenFile={onOpenFile}
      />
    );
  }

  return null;
}
