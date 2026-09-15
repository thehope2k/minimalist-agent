import {
  Archive,
  ArchiveRestore,
  FolderOpen,
  Inbox,
  MoreHorizontal,
  Pencil,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { IconButton, Menu, type MenuItem } from '../../ui';
import type { Project, SessionMeta } from '@/lib/electron';
import { revealLabel } from './utils';

type SessionRowActionsProps = {
  session: SessionMeta;
  projects: Project[];
  open: boolean;
  regenerating: boolean;
  onOpenChange: (open: boolean) => void;
  onRename: () => void;
  onRegenerateTitle: () => void;
  onArchiveToggle: () => void;
  onReveal: () => void;
  onMoveTo: (projectId: string | null) => void;
  onDelete: () => void;
};

export function SessionRowActions({
  session,
  projects,
  open,
  regenerating,
  onOpenChange,
  onRename,
  onRegenerateTitle,
  onArchiveToggle,
  onReveal,
  onMoveTo,
  onDelete,
}: SessionRowActionsProps) {
  const items: Array<MenuItem | 'separator'> = [
    { label: 'Rename', icon: Pencil, onSelect: onRename },
    {
      label: regenerating ? 'Regenerating…' : 'Regenerate title',
      icon: Sparkles,
      onSelect: onRegenerateTitle,
    },
    {
      label: session.archived ? 'Restore' : 'Archive',
      icon: session.archived ? ArchiveRestore : Archive,
      onSelect: onArchiveToggle,
    },
    { label: revealLabel(), icon: FolderOpen, onSelect: onReveal },
    'separator',
    {
      label: session.projectId === null ? 'Unassigned ✓' : 'Remove from project',
      icon: Inbox,
      onSelect: () => onMoveTo(null),
    },
    ...projects.map<MenuItem>((project) => ({
      label: session.projectId === project.id ? `In ${project.name} ✓` : `Move to ${project.name}`,
      onSelect: () => onMoveTo(project.id),
    })),
    'separator',
    { label: 'Delete', icon: Trash2, variant: 'destructive', onSelect: onDelete },
  ];

  return (
    <Menu
      open={open}
      onOpenChange={onOpenChange}
      trigger={
        <IconButton
          icon={MoreHorizontal}
          label="More"
          size="sm"
          className="bg-elevated/80 hover:bg-elevated-2"
        />
      }
      items={items}
    />
  );
}
