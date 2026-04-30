// Per-skill action menu: open in editor, reveal in finder, validate,
// delete. Mirrors the SessionRow `MoreHorizontal` pattern.
//
// Re-uses the project's `Menu` ui primitive so tooltip / hover behavior
// matches the rest of the app.

import { CheckCircle2, FolderOpen, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { IconButton, Menu, type MenuItem } from '../ui';
import {
  deleteSkill as deleteSkillRpc,
  openInEditor,
  revealInFinder,
  validate as validateRpc,
} from '@/lib/skills';
import type { LoadedSkill } from '@/lib/electron';

type Props = {
  skill: LoadedSkill;
  /** Callback fired after a successful delete so the parent can drop selection. */
  onAfterDelete?: () => void;
  /** Visual treatment — the panel uses `panel`, the info-page header uses `header`. */
  variant?: 'panel' | 'header';
  onOpenChange?: (open: boolean) => void;
};

export function SkillMenu({
  skill,
  onAfterDelete,
  variant = 'panel',
  onOpenChange,
}: Props) {
  const handleOpen = () => void openInEditor(skill.path);
  const handleReveal = () => void revealInFinder(skill.path);

  const handleValidate = async () => {
    const { ok, report } = await validateRpc(skill.path, skill.slug);
    window.alert(`${ok ? 'Skill OK' : 'Validation failed'}\n\n${report}`);
  };

  const handleDelete = async () => {
    if (
      !window.confirm(
        `Delete skill "${skill.metadata.name}" (slug: ${skill.slug})?\n\n` +
          `This will remove ${skill.path} and cannot be undone.`,
      )
    ) {
      return;
    }
    const ok = await deleteSkillRpc(skill.slug);
    if (ok) onAfterDelete?.();
    else window.alert('Failed to delete skill.');
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
