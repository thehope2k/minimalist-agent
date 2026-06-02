import { useState, useEffect } from 'react';
import type { View } from '../layout/TopBar';
import type { SettingsCategory } from '../settings/SettingsCategoriesPanel';
import { useSkills } from '@/hooks/useSkills';
import { useAgents } from '@/hooks/useAgents';
import { useExtensions } from '@/hooks/useExtensions';

/**
 * Manages view navigation state (all/chat/skills/agents/extensions/settings)
 * and active items within each view.
 */
export function useViewNavigation() {
  const [view, setView] = useState<View>('all');
  const [settingsCategory, setSettingsCategory] = useState<SettingsCategory>('ai');
  const [activeSkillSlug, setActiveSkillSlug] = useState<string | null>(null);
  const [activeAgentSlug, setActiveAgentSlug] = useState<string | null>(null);
  const [activeExtensionSlug, setActiveExtensionSlug] = useState<string | null>(null);

  const skills = useSkills();
  const agents = useAgents();
  const extensions = useExtensions();

  const inSettings = view === 'settings';
  const inSkills = view === 'skills';
  const inAgents = view === 'agents';
  const inExtensions = view === 'extensions';

  const activeSkill = inSkills
    ? skills?.find((s) => s.slug === activeSkillSlug) ?? null
    : null;
  const activeAgent = inAgents
    ? agents?.find((a) => a.slug === activeAgentSlug) ?? null
    : null;
  const activeExtension = inExtensions
    ? extensions?.find((e) => e.slug === activeExtensionSlug) ?? null
    : null;

  // Reset active item if it no longer exists after a reload
  useEffect(() => {
    if (!inSkills || !activeSkillSlug || !skills) return;
    if (!skills.some((s) => s.slug === activeSkillSlug)) {
      setActiveSkillSlug(null);
    }
  }, [inSkills, activeSkillSlug, skills]);

  useEffect(() => {
    if (!inAgents || !activeAgentSlug || !agents) return;
    if (!agents.some((a) => a.slug === activeAgentSlug)) {
      setActiveAgentSlug(null);
    }
  }, [inAgents, activeAgentSlug, agents]);

  useEffect(() => {
    if (!inExtensions || !activeExtensionSlug || !extensions) return;
    if (!extensions.some((e) => e.slug === activeExtensionSlug)) {
      setActiveExtensionSlug(null);
    }
  }, [inExtensions, activeExtensionSlug, extensions]);

  return {
    view,
    setView,
    settingsCategory,
    setSettingsCategory,
    activeSkillSlug,
    setActiveSkillSlug,
    activeAgentSlug,
    setActiveAgentSlug,
    activeExtensionSlug,
    setActiveExtensionSlug,
    inSettings,
    inSkills,
    inAgents,
    inExtensions,
    activeSkill,
    activeAgent,
    activeExtension,
  };
}
