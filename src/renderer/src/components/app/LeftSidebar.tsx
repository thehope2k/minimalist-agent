import type { ProjectFilter, View } from '../layout/TopBar';
import type { SettingsCategory } from '../settings/SettingsCategoriesPanel';
import type { SeedSubmit } from './types';
import { SettingsCategoriesPanel } from '../settings/SettingsCategoriesPanel';
import { SkillsPanel } from '../skills/SkillsPanel';
import { AgentsPanel } from '../agents';
import { ExtensionsPanel } from '../extensions/ExtensionsPanel';
import { SessionsPanel } from '../layout/SessionsPanel';

type Props = {
  view: View;
  inSettings: boolean;
  inSkills: boolean;
  inAgents: boolean;
  inExtensions: boolean;
  settingsCategory: SettingsCategory;
  onSettingsCategoryChange: (cat: SettingsCategory) => void;
  activeSkillSlug: string | null;
  onSkillSelect: (slug: string | null) => void;
  activeAgentSlug: string | null;
  onAgentSelect: (slug: string | null) => void;
  activeExtensionSlug: string | null;
  onExtensionSelect: (slug: string | null) => void;
  activeSessionId: string | null;
  onSessionSelect: (id: string | null) => void;
  onActiveSessionDeleted: () => void;
  projectFilter: ProjectFilter;
  onNewSession: () => void;
  onResumeNewSession: () => void;
  streamingSessionIds: ReadonlySet<string>;
  startSessionWithSubmission: (submit: SeedSubmit) => void;
};

/**
 * Left sidebar: renders appropriate panel based on current view.
 */
export function LeftSidebar({
  view,
  inSettings,
  inSkills,
  inAgents,
  inExtensions,
  settingsCategory,
  onSettingsCategoryChange,
  activeSkillSlug,
  onSkillSelect,
  activeAgentSlug,
  onAgentSelect,
  activeExtensionSlug,
  onExtensionSelect,
  activeSessionId,
  onSessionSelect,
  onActiveSessionDeleted,
  projectFilter,
  onNewSession,
  onResumeNewSession,
  streamingSessionIds,
  startSessionWithSubmission,
}: Props) {
  if (inSettings) {
    return (
      <SettingsCategoriesPanel
        active={settingsCategory}
        onChange={onSettingsCategoryChange}
      />
    );
  }

  if (inSkills) {
    return (
      <SkillsPanel
        activeSlug={activeSkillSlug}
        onSelect={onSkillSelect}
        onStartChatWithSubmission={startSessionWithSubmission}
      />
    );
  }

  if (inAgents) {
    return (
      <AgentsPanel
        activeSlug={activeAgentSlug}
        onSelect={onAgentSelect}
        onStartChatWithSubmission={startSessionWithSubmission}
      />
    );
  }

  if (inExtensions) {
    return (
      <ExtensionsPanel
        activeSlug={activeExtensionSlug}
        onSelect={onExtensionSelect}
        onStartChatWithSubmission={startSessionWithSubmission}
      />
    );
  }

  return (
    <SessionsPanel
      view={view}
      activeId={activeSessionId}
      projectFilter={projectFilter}
      onSelect={onSessionSelect}
      onActiveDeleted={onActiveSessionDeleted}
      onNewSession={onNewSession}
      onResumeNewSession={onResumeNewSession}
      streamingSessionIds={streamingSessionIds}
    />
  );
}
