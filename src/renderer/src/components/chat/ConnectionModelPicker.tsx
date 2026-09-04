import { useMemo, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { ChevronDown, Eye, EyeOff } from 'lucide-react';
import type { ConnectionMeta } from '@/lib/electron';
import { cn } from '@/lib/utils';
import { BrandMark, categorize, type ProviderCategory } from './connection-model-picker/shared';
import { ConnectionList } from './connection-model-picker/ConnectionList';
import { ModelList } from './connection-model-picker/ModelList';

interface Props {
  connections: ConnectionMeta[];
  activeSlug: string;
  activeModelId: string;
  /** Called when the user picks a model. Carries both slug + model id. */
  onChange: (slug: string, modelId: string) => void;
  disabled?: boolean;
  connectionLocked?: boolean;
}

export function ConnectionModelPicker({
  connections,
  activeSlug,
  activeModelId,
  onChange,
  disabled,
  connectionLocked,
}: Props) {
  const [open, setOpen] = useState(false);
  /** When set, we render the model list for this connection slug. */
  const [drilledInto, setDrilledInto] = useState<string | null>(null);

  // Reset drill state on close so the next open starts at the top level
  // (or stays drilled into the active connection when locked).
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setDrilledInto(null);
  };

  const activeConn = useMemo(
    () => connections.find((c) => c.slug === activeSlug),
    [connections, activeSlug],
  );
  const activeModel = useMemo(
    () => activeConn?.models.find((m) => m.id === activeModelId),
    [activeConn, activeModelId],
  );
  const activeCategory: ProviderCategory = activeConn
    ? categorize(activeConn)
    : 'other';

  // Group connections by provider category, preserving insertion order.
  const groups = useMemo(() => {
    const map = new Map<ProviderCategory, ConnectionMeta[]>();
    for (const c of connections) {
      const k = categorize(c);
      const arr = map.get(k);
      if (arr) arr.push(c);
      else map.set(k, [c]);
    }
    return Array.from(map.entries());
  }, [connections]);

  // Locked sessions skip the connection-list view entirely.
  const effectiveDrilledSlug = connectionLocked ? activeSlug : drilledInto;
  const drilledConn = effectiveDrilledSlug
    ? connections.find((c) => c.slug === effectiveDrilledSlug) ?? null
    : null;

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger asChild disabled={disabled}>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md border border-transparent bg-transparent px-2 py-1 text-xs text-fg-muted transition-colors',
            'hover:bg-elevated hover:text-fg',
            'disabled:cursor-not-allowed disabled:opacity-60',
            open && 'bg-elevated text-fg',
          )}
        >
          <BrandMark category={activeCategory} />
          <span className="truncate">
            {activeModel?.name ?? 'Pick a model'}
          </span>
          {activeModel && (
            activeModel.supportsVision ? (
              <span title="Vision supported">
                <Eye
                  className="h-3 w-3 shrink-0 text-fg-subtle"
                  strokeWidth={1.75}
                />
              </span>
            ) : (
              <span title="No vision support">
                <EyeOff
                  className="h-3 w-3 shrink-0 text-fg-subtle opacity-40"
                  strokeWidth={1.75}
                />
              </span>
            )
          )}
          <ChevronDown
            className="h-3 w-3 shrink-0 text-fg-subtle"
            strokeWidth={1.75}
          />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          collisionPadding={8}
          className="z-50 w-[320px] overflow-hidden rounded-lg border border-border bg-panel p-1 shadow-2xl"
        >
          {drilledConn ? (
            <ModelList
              connection={drilledConn}
              activeModelId={
                drilledConn.slug === activeSlug ? activeModelId : ''
              }
              // No back button when the session is locked — there's
              // nowhere to go (the top-level connection list is hidden).
              onBack={connectionLocked ? null : () => setDrilledInto(null)}
              onPick={(modelId) => {
                onChange(drilledConn.slug, modelId);
                setOpen(false);
                setDrilledInto(null);
              }}
            />
          ) : (
            <ConnectionList
              groups={groups}
              activeSlug={activeSlug}
              onDrill={(slug) => setDrilledInto(slug)}
            />
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
