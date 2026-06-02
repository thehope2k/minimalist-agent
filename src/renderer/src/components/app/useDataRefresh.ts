import { useEffect } from 'react';
import { reload as reloadSkills } from '@/lib/skills';
import { reload as reloadAgents } from '@/lib/agents';
import { reload as reloadExtensions } from '@/lib/extensions';

/**
 * Refreshes skills, agents, and extensions when a chat turn completes
 * (agent may have written SKILL.md, AGENT.md, or extension files).
 */
export function useDataRefresh() {
  useEffect(() => {
    if (!window.api?.chat) return;
    return window.api.chat.onEvent((evt) => {
      if (evt.type === 'turn_done') {
        void reloadSkills();
        void reloadAgents();
        void reloadExtensions();
      }
    });
  }, []);
}
