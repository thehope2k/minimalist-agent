import { useEffect, useRef, useState } from 'react';
import { ChevronRight, FolderGit2, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ClaudeSyncGroup, ClaudeSyncItem } from '@/lib/electron';
import { SyncItemRow } from './SyncItemRow';

type Props = {
  group: ClaudeSyncGroup;
  onToggle: (groupId: string, keys: string[], include: boolean) => void;
  disabled: boolean;
};

const isChange = (i: ClaudeSyncItem): boolean =>
  i.action === 'add' || i.action === 'update' || i.action === 'remove';

export function SyncGroup({ group, onToggle, disabled }: Props) {
  const [showUpToDate, setShowUpToDate] = useState(false);
  const [showSkipped, setShowSkipped] = useState(false);
  const selectable = group.items.filter((i) => i.selectable);
  const included = selectable.filter((i) => !i.excluded).length;
  const checkboxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = included > 0 && included < selectable.length;
    }
  }, [included, selectable.length]);

  const changes = group.items.filter(isChange);
  const excluded = group.items.filter((i) => i.action === 'excluded');
  const upToDate = group.items.filter((i) => i.action === 'unchanged');
  const skipped = group.items.filter((i) => i.action === 'skip');
  const toggleOne = (key: string, include: boolean) => onToggle(group.id, [key], include);
  const Icon = group.kind === 'user' ? User : FolderGit2;

  return (
    <section className="border-b border-border/60 py-2 last:border-b-0">
      <label className="flex cursor-pointer items-center gap-2 px-5 py-1">
        <input
          ref={checkboxRef}
          type="checkbox"
          className="h-3.5 w-3.5 accent-accent"
          checked={selectable.length > 0 && included === selectable.length}
          disabled={disabled || selectable.length === 0}
          onChange={(e) =>
            onToggle(
              group.id,
              selectable.map((i) => i.key),
              e.target.checked,
            )
          }
        />
        <Icon className="h-3.5 w-3.5 shrink-0 text-fg-muted" strokeWidth={1.75} />
        <span className="text-sm font-medium text-fg">{group.label}</span>
        <code
          className="min-w-0 truncate font-mono text-[11px] text-fg-subtle"
          title={group.claudeDir}
        >
          {group.claudeDir}
        </code>
        <span className="ml-auto shrink-0 text-xs text-fg-subtle">
          {changes.length > 0 ? `${changes.length} change(s)` : 'up to date'}
        </span>
      </label>

      <ul className="px-2">
        {changes.map((item) => (
          <SyncItemRow key={item.key} item={item} onToggle={toggleOne} disabled={disabled} />
        ))}
        {excluded.map((item) => (
          <SyncItemRow key={item.key} item={item} onToggle={toggleOne} disabled={disabled} />
        ))}
      </ul>
      <Collapsible
        label={`Up to date (${upToDate.length})`}
        open={showUpToDate}
        onToggle={() => setShowUpToDate((v) => !v)}
        items={upToDate}
        onToggleItem={toggleOne}
        disabled={disabled}
      />
      <Collapsible
        label={`Skipped (${skipped.length})`}
        open={showSkipped}
        onToggle={() => setShowSkipped((v) => !v)}
        items={skipped}
      />
    </section>
  );
}

function Collapsible({
  label,
  open,
  onToggle,
  items,
  onToggleItem,
  disabled,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  items: ClaudeSyncItem[];
  onToggleItem?: (key: string, include: boolean) => void;
  disabled?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-1 px-5 py-1 text-[11px] text-fg-subtle hover:text-fg-muted"
      >
        <ChevronRight
          className={cn('h-3 w-3 transition-transform', open && 'rotate-90')}
          strokeWidth={2}
        />
        {label}
      </button>
      {open && (
        <ul className="px-2">
          {items.map((item) => (
            <SyncItemRow key={item.key} item={item} onToggle={onToggleItem} disabled={disabled} />
          ))}
        </ul>
      )}
    </>
  );
}
