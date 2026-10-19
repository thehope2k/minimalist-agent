import type { ComponentProps } from 'react';
import { ContextPanel } from '../context/ContextPanel';
import { FileExplorerPanel, FileViewPanel } from '../files';
import { BrowserPanel } from '../browser/BrowserPanel';
import type { ActiveSidePanel } from './usePanelStates';
import { reload as reloadSessions, type SessionMeta } from '@/lib/sessions';

interface AppSidePanelProps {
  activeSidePanel: ActiveSidePanel;
  activeCwd: string | undefined;
  activeSessionId: string | null;
  fileExplorerOpen: boolean;
  sessions: SessionMeta[] | null;
  viewFile: { absolutePath: string; lineNumber: number } | null;
  fileOrigin: ActiveSidePanel;
  onOpenFile: (absolutePath: string, lineNumber: number) => void;
  onCloseFile: () => void;
  onHideFile: () => void;
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
  viewFile,
  fileOrigin,
  onOpenFile,
  onCloseFile,
  onHideFile,
  onToggleFileExplorer,
  onToggleContextPanel,
  onToggleBrowserPanel,
  startSessionWithSubmission,
}: AppSidePanelProps) {
  if (activeSidePanel === 'browser') {
    return <BrowserPanel sessionId={activeSessionId} onHidePanel={onToggleBrowserPanel} />;
  }

  if (activeSidePanel === 'file') {
    return viewFile ? (
      <FileViewPanel
        absolutePath={viewFile.absolutePath}
        lineNumber={viewFile.lineNumber}
        onClose={onHideFile}
        onBack={fileOrigin ? onCloseFile : undefined}
        onOpenFile={onOpenFile}
      />
    ) : null;
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
