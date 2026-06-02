import { Pencil, Trash2 } from 'lucide-react';
import { IconButton } from '@/components/ui';
import { ProjectChip } from './ProjectChip';
import type { ProjectListItemProps } from './types';

/**
 * Single project row in the list.
 */
export function ProjectListItem({
  project: p,
  sessionCount,
  connectionLabel,
  permissionLabel,
  onEdit,
  onDelete,
}: ProjectListItemProps) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span
        className="h-3 w-3 shrink-0 rounded-full"
        style={{ backgroundColor: p.color ?? 'var(--color-accent)' }}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-fg">
          {p.name}
        </div>
        <div className="truncate text-xs text-fg-subtle">
          {p.rootPath}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <ProjectChip
            prefix="Mode"
            label={
              p.defaultPermissionMode
                ? permissionLabel(p.defaultPermissionMode)
                : 'Default'
            }
            muted={!p.defaultPermissionMode}
          />
          <ProjectChip
            prefix="Autonomy"
            label={
              p.defaultAutonomyLevel !== undefined
                ? `${p.defaultAutonomyLevel}%`
                : 'Default'
            }
            muted={p.defaultAutonomyLevel === undefined}
          />
          <ProjectChip
            prefix="Connection"
            label={
              p.defaultConnectionSlug
                ? connectionLabel(p.defaultConnectionSlug)
                : 'Default'
            }
            muted={!p.defaultConnectionSlug}
          />
          <ProjectChip
            prefix="Model"
            label={
              p.defaultModel
                ? p.defaultModel
                : 'Default'
            }
            muted={!p.defaultModel}
          />
          <ProjectChip
            prefix="Co-Author"
            label={
              p.includeCoAuthoredBy === undefined
                ? 'Default'
                : p.includeCoAuthoredBy
                  ? 'On'
                  : 'Off'
            }
            muted={p.includeCoAuthoredBy === undefined}
          />
        </div>
      </div>
      <span className="shrink-0 text-xs text-fg-subtle">
        {sessionCount} session
        {sessionCount === 1 ? '' : 's'}
      </span>
      <div className="flex shrink-0 items-center gap-1">
        <IconButton
          icon={Pencil}
          label="Edit"
          size="sm"
          onClick={() => onEdit(p)}
        />
        <IconButton
          icon={Trash2}
          label="Delete"
          size="sm"
          onClick={() => onDelete(p)}
        />
      </div>
    </li>
  );
}
