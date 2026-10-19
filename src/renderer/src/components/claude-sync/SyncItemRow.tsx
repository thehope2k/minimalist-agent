import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ClaudeSyncItem, ClaudeSyncKind } from '@/lib/electron';

const KIND_LABEL: Record<ClaudeSyncKind, string> = {
  skill: 'Skill',
  agent: 'Agent',
  mcp: 'MCP',
  env: 'Env',
};

const ACTION_STYLE: Record<ClaudeSyncItem['action'], string> = {
  add: 'text-emerald-400',
  update: 'text-accent',
  remove: 'text-red-400',
  skip: 'text-fg-subtle',
  unchanged: 'text-fg-subtle',
  excluded: 'text-fg-subtle',
};

const ACTION_LABEL: Record<ClaudeSyncItem['action'], string> = {
  add: 'Add',
  update: 'Update',
  remove: 'Remove',
  skip: 'Skip',
  unchanged: 'Up to date',
  excluded: 'Excluded',
};

type Props = {
  item: ClaudeSyncItem;
  onToggle?: (key: string, include: boolean) => void;
  disabled?: boolean;
};

export function SyncItemRow({ item, onToggle, disabled }: Props) {
  const selectable = item.selectable && onToggle;
  return (
    <li>
      <label
        className={cn(
          'flex items-start gap-2 rounded-md px-3 py-1.5 text-xs',
          selectable && 'cursor-pointer hover:bg-elevated/60',
        )}
      >
        <span className="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center">
          {selectable && (
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-accent"
              checked={!item.excluded}
              disabled={disabled}
              onChange={(e) => onToggle(item.key, e.target.checked)}
            />
          )}
        </span>
        <span className={cn('w-17 shrink-0 font-medium', ACTION_STYLE[item.action])}>
          {ACTION_LABEL[item.action]}
        </span>
        <span className="w-11 shrink-0 rounded bg-elevated px-1.5 py-0.5 text-center text-[10px] text-fg-muted">
          {KIND_LABEL[item.kind]}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="truncate font-mono text-fg">{item.name}</span>
            <span className="truncate text-fg-subtle">{item.source}</span>
          </span>
          {item.reason && <span className="block text-fg-subtle">{item.reason}</span>}
          {item.warnings.map((w) => (
            <span key={w} className="flex items-center gap-1 text-amber-300">
              <AlertTriangle className="h-3 w-3 shrink-0" strokeWidth={2} />
              {w}
            </span>
          ))}
        </span>
      </label>
    </li>
  );
}
