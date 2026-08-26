import { useState } from 'react';
import type { LoadedAgent } from '@/lib/electron';
import type { SeedSubmit } from '@/App';
import type { EditAgentMode } from '../EditAgentDialog';

const COPY_FEEDBACK_MS = 2000;

export function useAgentActions(
  agent: LoadedAgent,
  onStartChatWithSubmission?: (submit: SeedSubmit) => void,
) {
  const [editMode, setEditMode] = useState<EditAgentMode | null>(null);
  const [copied, setCopied] = useState(false);

  const copySlug = async () => {
    await navigator.clipboard.writeText(agent.slug);
    setCopied(true);
    window.setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
  };

  const handleEdit = (mode: EditAgentMode) => {
    if (!onStartChatWithSubmission) return;
    setEditMode(mode);
  };

  const closeEditDialog = () => setEditMode(null);

  return {
    copied,
    editMode,
    copySlug,
    handleEdit,
    closeEditDialog,
  };
}
