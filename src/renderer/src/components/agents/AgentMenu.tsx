import { CheckCircle2, FolderOpen, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { IconButton, Menu, type MenuItem } from '../ui';
import {
  deleteAgent,
  openInEditor,
  revealInFinder,
  validate,
} from '@/lib/agents';
import type { LoadedAgent } from '@/lib/electron';

type Props = {
  agent: LoadedAgent;
  onAfterDelete?: () => void;
  variant?: 'panel' | 'header';
  onOpenChange?: (open: boolean) => void;
};

export function AgentMenu({
  agent,
  onAfterDelete,
  variant = 'panel',
  onOpenChange,
}: Props) {
  const handleOpen = () => void openInEditor(agent.path);
  const handleReveal = () => void revealInFinder(agent.path);

  const handleValidate = async () => {
    const { ok, report } = await validate(agent.path, agent.slug);
    window.alert(`${ok ? 'Agent OK' : 'Validation failed'}\n\n${report}`);
  };

  const handleDelete = async () => {
    if (
      !window.confirm(
        `Delete agent "${agent.metadata.name}" (slug: ${agent.slug})?\n\n` +
          `This will remove ${agent.path} and cannot be undone.`,
      )
    ) {
      return;
    }

    const ok = await deleteAgent(agent.slug);
    if (ok) onAfterDelete?.();
    else window.alert('Failed to delete agent.');
  };

  const items: Array<MenuItem | 'separator'> = [
    { label: 'Open in editor', icon: Pencil, onSelect: handleOpen },
    { label: 'Show in Finder', icon: FolderOpen, onSelect: handleReveal },
    { label: 'Validate', icon: CheckCircle2, onSelect: handleValidate },
    'separator',
    {
      label: 'Delete',
      icon: Trash2,
      variant: 'destructive',
      onSelect: handleDelete,
    },
  ];

  return (
    <Menu
      onOpenChange={onOpenChange}
      trigger={
        <IconButton
          icon={MoreHorizontal}
          label="More"
          size="sm"
          className={
            variant === 'panel'
              ? 'bg-elevated/80 hover:bg-elevated-2'
              : 'hover:bg-elevated'
          }
        />
      }
      items={items}
    />
  );
}
