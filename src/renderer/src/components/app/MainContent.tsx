import type { View } from '../layout/TopBar';
import type { SettingsCategory } from '../settings/SettingsCategoriesPanel';
import type { SeedSubmit } from './types';
import type { LoadedSkill, LoadedAgent, LoadedExtension } from '@/lib/electron';
import { ChatArea } from '../layout/ChatArea';
import { SettingsContent } from '../settings/SettingsContent';
import { SkillInfoPage } from '../skills/SkillInfoPage';
import { AgentInfoPage } from '../agents';
import { ExtensionInfoPage } from '../extensions/ExtensionInfoPage';

type Props = {
  view: View;
  inSettings: boolean;
  inSkills: boolean;
  inAgents: boolean;
  inExtensions: boolean;
  settingsCategory: SettingsCategory;
  activeSkill: LoadedSkill | null;
  onSkillClose: () => void;
  activeAgent: LoadedAgent | null;
  onAgentClose: () => void;
  activeExtension: LoadedExtension | null;
  onExtensionClose: () => void;
  activeSessionId: string | null;
  onSessionCreated: (id: string) => void;
  onNewSession: () => void;
  seedSubmit: SeedSubmit | null;
  onSeedSubmitConsumed: () => void;
  newSessionDefaultProjectId: string | null;
  onStreamingChange: (ids: ReadonlySet<string>) => void;
  onCwdChange: (cwd: string | undefined) => void;
  onOpenFile: (absolutePath: string, lineNumber: number) => void;
  onToggleFileExplorer: () => void;
  onToggleContextPanel?: () => void;
  fileExplorerOpen: boolean;
  startSessionWithSubmission: (submit: SeedSubmit) => void;
};

/**
 * Main content area: renders ChatArea or info pages based on view.
 */
export function MainContent({
  view,
  inSettings,
  inSkills,
  inAgents,
  inExtensions,
  settingsCategory,
  activeSkill,
  onSkillClose,
  activeAgent,
  onAgentClose,
  activeExtension,
  onExtensionClose,
  activeSessionId,
  onSessionCreated,
  onNewSession,
  seedSubmit,
  onSeedSubmitConsumed,
  newSessionDefaultProjectId,
  onStreamingChange,
  onCwdChange,
  onOpenFile,
  onToggleFileExplorer,
  fileExplorerOpen,
  onToggleContextPanel,
  startSessionWithSubmission,
}: Props) {
  return (
    <>
      <div
        className="h-full w-full"
        style={{
          display: inSettings || inSkills || inAgents || inExtensions ? 'none' : 'block',
        }}
      >
        <ChatArea
          sessionId={activeSessionId}
          onSessionCreated={onSessionCreated}
          onNewSession={onNewSession}
          seedSubmit={seedSubmit}
          onSeedSubmitConsumed={onSeedSubmitConsumed}
          newSessionDefaultProjectId={newSessionDefaultProjectId}
          onStreamingChange={onStreamingChange}
          onCwdChange={onCwdChange}
          shortcutsEnabled={view === 'all'}
          onOpenFile={onOpenFile}
          onToggleFileExplorer={onToggleFileExplorer}
          fileExplorerOpen={fileExplorerOpen}
          onToggleContextPanel={onToggleContextPanel}
        />
      </div>

      {inSettings && <SettingsContent category={settingsCategory} />}

      {inSkills && (
        <SkillInfoPage
          skill={activeSkill}
          onClose={onSkillClose}
          onStartChatWithSubmission={startSessionWithSubmission}
        />
      )}

      {inAgents && (
        <AgentInfoPage
          agent={activeAgent}
          onClose={onAgentClose}
          onStartChatWithSubmission={startSessionWithSubmission}
        />
      )}

      {inExtensions && (
        <ExtensionInfoPage
          extension={activeExtension}
          onClose={onExtensionClose}
        />
      )}
    </>
  );
}
