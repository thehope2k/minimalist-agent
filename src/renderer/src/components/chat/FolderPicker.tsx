import { useMemo, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Check, Folder, FolderOpen, Lock, X } from 'lucide-react';
import { homedir } from '@/lib/path';
import { useAiData } from '@/hooks/useAiData';
import { pushRecentFolder, removeRecentFolder } from '@/lib/connections';
import { Button } from '../ui';
import { cn } from '@/lib/utils';

type Props = {
  value?: string;
  onChange: (path: string | undefined) => void;
  /**
   * When true, the picker becomes read-only — typically set after the
   * first message lands so the SDK's per-cwd conversation history doesn't
   * desync. The trigger still shows the chosen folder name.
   */
  locked?: boolean;
};

const LOCKED_TOOLTIP =
  'Working directory is fixed once the conversation starts. Click "New" to start a fresh session in a different folder.';

export function FolderPicker({ value, onChange, locked }: Props) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const data = useAiData();
  const recents = data?.settings.recentFolders ?? [];

  const items = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return recents;
    return recents.filter(
      (p) => basename(p).toLowerCase().includes(q) || p.toLowerCase().includes(q),
    );
  }, [filter, recents]);

  const choose = async (path: string) => {
    onChange(path);
    await pushRecentFolder(path);
    setOpen(false);
  };

  const browse = async () => {
    const picked = await window.api.fs.pickDirectory();
    if (!picked) return;
    await choose(picked);
  };

  const reset = () => {
    onChange(undefined);
    setOpen(false);
  };

  const remove = async (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    await removeRecentFolder(path);
    if (path === value) onChange(undefined);
  };

  // No explicit pick → fall back to the user's home directory. Shown
  // with a `~` so users can tell it's the default and not their choice.
  const home = homedir();
  const effective = value ?? home;
  const isDefault = !value;
  const label = isDefault ? '~' : basename(effective);

  if (locked) {
    return (
      <Button
        variant="outline"
        size="sm"
        icon={Lock}
        disabled
        className="ml-1 rounded-full !opacity-70"
        title={LOCKED_TOOLTIP + (isDefault ? ` (using ${home})` : '')}
      >
        {label}
      </Button>
    );
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button
          variant="outline"
          size="sm"
          icon={Folder}
          className={cn(
            'ml-1 rounded-full text-fg-muted hover:text-fg',
            open && 'text-fg',
            isDefault && 'italic',
          )}
          title={
            isDefault
              ? `Default working directory: ${home}. Click to change.`
              : effective
          }
        >
          {label}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          side="top"
          sideOffset={6}
          collisionPadding={8}
          className="z-50 w-100 overflow-hidden rounded-lg border border-border bg-panel p-1 shadow-2xl"
        >
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter folders…"
            autoFocus
            className="block w-full rounded-md bg-transparent px-2.5 py-2 text-sm text-fg placeholder:text-fg-subtle outline-none"
          />
          <div className="my-1 h-px bg-border" />

          <div className="scroll-thin max-h-72 overflow-auto py-1">
            {items.length === 0 ? (
              <div className="px-2.5 py-3 text-center text-sm text-fg-subtle">
                {recents.length === 0
                  ? 'No recent folders. Use Choose Folder… below.'
                  : 'No matches.'}
              </div>
            ) : (
              items.map((path) => {
                const isSelected = path === value;
                return (
                  <button
                    key={path}
                    type="button"
                    onClick={() => choose(path)}
                    className={cn(
                      'group flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left transition-colors',
                      'hover:bg-elevated',
                      isSelected && 'bg-elevated/60',
                    )}
                  >
                    <Folder
                      className="h-3.5 w-3.5 shrink-0 text-fg-muted"
                      strokeWidth={1.75}
                    />
                    <span className="truncate text-sm text-fg">{basename(path)}</span>
                    <span className="truncate text-xs text-fg-subtle">
                      in {prettyParent(path)}
                    </span>
                    <span className="ml-auto shrink-0">
                      {isSelected ? (
                        <Check className="h-3.5 w-3.5 text-fg" strokeWidth={2} />
                      ) : (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => void remove(e, path)}
                          className="invisible grid h-5 w-5 place-items-center rounded-md text-fg-muted hover:bg-elevated-2 hover:text-fg group-hover:visible"
                          title="Remove from recents"
                        >
                          <X className="h-3 w-3" strokeWidth={2} />
                        </span>
                      )}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          <div className="my-1 h-px bg-border" />
          <button
            type="button"
            onClick={browse}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-fg hover:bg-elevated"
          >
            <FolderOpen className="h-3.5 w-3.5 shrink-0 text-fg-muted" strokeWidth={1.75} />
            Choose Folder…
          </button>
          <button
            type="button"
            onClick={reset}
            disabled={!value}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-fg hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5 shrink-0 text-fg-muted" strokeWidth={1.75} />
            Reset
          </button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function basename(p: string): string {
  const segments = p.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] ?? p;
}

function prettyParent(p: string): string {
  const home = homedir();
  const parent = p.split(/[\\/]/).slice(0, -1).join('/');
  if (home && parent.startsWith(home)) {
    const tail = parent.slice(home.length).replace(/^[\\/]/, '');
    return tail || '~';
  }
  return parent;
}

