import { useState } from 'react';
import type { LoadedSkill } from '@/lib/electron';
import type { SeedSubmit } from '@/App';
import type { EditSkillMode } from '../EditSkillDialog';

/**
 * Handles skill actions: copy mention to clipboard, initiate edit flow.
 */
export function useSkillActions(
  skill: LoadedSkill,
  onStartChatWithSubmission?: (submit: SeedSubmit) => void,
) {
  const [editMode, setEditMode] = useState<EditSkillMode | null>(null);
  const [copied, setCopied] = useState(false);
  const mention = `@${skill.slug}`;

  const copyMention = async () => {
    await navigator.clipboard.writeText(mention);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  const handleEdit = (mode: EditSkillMode) => {
    if (!onStartChatWithSubmission) return;
    setEditMode(mode);
  };

  const closeEditDialog = () => setEditMode(null);

  return {
    mention,
    copied,
    editMode,
    copyMention,
    handleEdit,
    closeEditDialog,
  };
}
