import { useCallback, useState } from 'react';
import { AppLayout } from './components/app/AppLayout';
import { useDataRefresh } from './components/app/useDataRefresh';
import { useKeyboardShortcuts } from './components/app/useKeyboardShortcuts';
import { usePanelStates } from './components/app/usePanelStates';
import { useProjectFilter, useSessionManagement } from './components/app/useSessionManagement';
import { useViewNavigation } from './components/app/useViewNavigation';
import { useResizablePanels } from './hooks/useResizablePanels';
import { push as pushRecentFile } from './lib/recent-files';

export type { SeedSubmit } from './components/app/types';

export default function App() {
  const navigation = useViewNavigation();
  const projectState = useProjectFilter();
  const panels = usePanelStates();
  const sessionState = useSessionManagement(
    navigation.view,
    navigation.setView,
    projectState.projectFilter,
    navigation.inSettings,
    navigation.inSkills,
    navigation.inAgents,
    navigation.inExtensions,
  );
  const [activeCwd, setActiveCwd] = useState<string | undefined>(undefined);
  const [viewFile, setViewFile] = useState<{ absolutePath: string; lineNumber: number } | null>(
    null,
  );
  const handleOpenFile = useCallback((absolutePath: string, lineNumber: number) => {
    pushRecentFile(absolutePath, lineNumber);
    setViewFile({ absolutePath, lineNumber });
  }, []);

  useKeyboardShortcuts(
    navigation.view,
    navigation.setView,
    panels.toggleTerminal,
    panels.toggleFileExplorer,
    panels.toggleContextPanel,
    sessionState.handleNewSession,
    panels.terminalOpenRef,
    panels.terminalPanelRef,
    sessionState.activeSessionId,
    sessionState.sessions,
  );
  useDataRefresh();

  const mainPanels = useResizablePanels('main-v4', ['main-left', 'main-right'], [28, 72]);
  const terminalPanels = useResizablePanels('terminal-v2', ['term-top', 'term-bottom'], [65, 35]);
  const explorerPanels = useResizablePanels(
    'explorer-v2',
    ['explorer-main', 'explorer-side'],
    [70, 30],
  );

  return (
    <AppLayout
      navigation={navigation}
      panels={panels}
      sessionState={sessionState}
      projectState={projectState}
      activeCwd={activeCwd}
      setActiveCwd={setActiveCwd}
      viewFile={viewFile}
      setViewFile={setViewFile}
      onOpenFile={handleOpenFile}
      mainPanels={mainPanels}
      terminalPanels={terminalPanels}
      explorerPanels={explorerPanels}
    />
  );
}
