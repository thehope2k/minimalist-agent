import { useMemo, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Check, ChevronDown, ChevronLeft, ChevronRight, Monitor, Plug } from 'lucide-react';
import {
  AnthropicMark,
  BrandMark as ConnectionBrandMark,
  GithubMark,
  OpenAIMark,
} from '../settings/connection-flow/shared';
import type { ConnectionMeta } from '@/lib/electron';
import { Badge } from '@/components/ui';
import { cn } from '@/lib/utils';

type ProviderCategory = 'anthropic' | 'copilot' | 'chatgpt' | 'local' | 'openai-compatible' | 'other';

function categorize(conn: ConnectionMeta): ProviderCategory {
  if (conn.providerType === 'pi' && conn.piAuthProvider === 'github-copilot') return 'copilot';
  if (conn.providerType === 'pi' && conn.piAuthProvider === 'openai-codex') return 'chatgpt';
  if (conn.providerType === 'local') return 'local';
  if (conn.providerType === 'openai-compatible') return 'openai-compatible';
  if (conn.providerType === 'anthropic') return 'anthropic';
  return 'other';
}

function categoryHeader(c: ProviderCategory): string {
  switch (c) {
    case 'anthropic': return 'Anthropic';
    case 'copilot':   return 'GitHub Copilot';
    case 'chatgpt':   return 'ChatGPT Plus';
    case 'local':     return 'Local';
    case 'openai-compatible': return 'OpenAI-compatible';
    default:          return 'Other';
  }
}

function BrandMark({ category, conn }: { category: ProviderCategory; conn?: ConnectionMeta }) {
  if (conn) return <ConnectionBrandMark conn={conn} />;
  if (category === 'anthropic') return <AnthropicMark />;
  if (category === 'copilot')   return <GithubMark />;
  if (category === 'chatgpt')   return <OpenAIMark />;
  if (category === 'local')     return <Monitor className="h-4 w-4 text-fg-muted" strokeWidth={1.75} />;
  if (category === 'openai-compatible') return <Plug className="h-4 w-4 text-fg-muted" strokeWidth={1.75} />;
  return <span className="grid h-4 w-4 place-items-center text-fg-subtle">·</span>;
}


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

/* ---- top-level: connections grouped by provider ----------------- */

function ConnectionList({
  groups,
  activeSlug,
  onDrill,
}: {
  groups: Array<[ProviderCategory, ConnectionMeta[]]>;
  activeSlug: string;
  onDrill: (slug: string) => void;
}) {
  if (groups.length === 0) {
    return (
      <div className="px-2.5 py-3 text-center text-sm text-fg-subtle">
        No connections yet.
      </div>
    );
  }
  return (
    <div className="scroll-thin max-h-112 overflow-auto">
      {groups.map(([cat, conns], i) => (
        <div key={cat} className={i === 0 ? '' : 'mt-1'}>
          <div className="px-2.5 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
            {categoryHeader(cat)}
          </div>
          {conns.map((conn) => {
            const isActive = conn.slug === activeSlug;
            return (
              <button
                key={conn.slug}
                type="button"
                onClick={() => onDrill(conn.slug)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors',
                  'hover:bg-elevated',
                  isActive && 'bg-elevated/60',
                )}
              >
                <BrandMark category={cat} conn={conn} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-fg">{conn.name}</div>
                  {cat === 'local' && (
                    <div className="text-[10px] text-fg-subtle">Runs locally via Ollama</div>
                  )}
                </div>
                {isActive && (
                  <Check
                    className="h-3.5 w-3.5 shrink-0 text-fg"
                    strokeWidth={2}
                  />
                )}
                <ChevronRight
                  className="h-3.5 w-3.5 shrink-0 text-fg-subtle"
                  strokeWidth={1.75}
                />
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/* ---- drilled-in: model list for one connection ------------------ */

function ModelList({
  connection,
  activeModelId,
  onBack,
  onPick,
}: {
  connection: ConnectionMeta;
  /** Empty string when this connection isn't the active one. */
  activeModelId: string;
  /** When null, the header is shown read-only (locked session). */
  onBack: (() => void) | null;
  onPick: (modelId: string) => void;
}) {
  return (
    <div className="scroll-thin max-h-112 overflow-auto">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-fg-subtle transition-colors hover:bg-elevated hover:text-fg"
        >
          <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
          <span className="truncate">{connection.name}</span>
        </button>
      ) : (
        <div className="px-2.5 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
          {connection.name}
        </div>
      )}
      {connection.models.length === 0 ? (
        <div className="px-2.5 py-3 text-center text-sm text-fg-subtle">
          No models on this connection.
        </div>
      ) : (
        <div className="mt-0.5">
          {connection.models.map((m) => {
            const isActive = m.id === activeModelId;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onPick(m.id)}
                className={cn(
                  'flex w-full items-start justify-between gap-3 rounded-md px-2.5 py-2 text-left transition-colors',
                  'hover:bg-elevated',
                  isActive && 'bg-elevated/60',
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm text-fg">{m.name}</span>
                    {m.supportsVision && (
                      <Badge
                        variant="accent"
                        className="shrink-0 normal-case tracking-normal"
                        title="Supports image input (vision)"
                      >
                        Vision
                      </Badge>
                    )}
                  </div>
                  {m.description && (
                    <div className="mt-0.5 truncate text-xs text-fg-subtle">
                      {m.description}
                    </div>
                  )}
                </div>
                {isActive && (
                  <Check
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fg"
                    strokeWidth={2}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
