// Top-level view of the popover: connections grouped by provider category.
// Drilling into a connection (via onDrill) swaps to ModelList.
import { Check, ChevronRight } from 'lucide-react';
import type { ConnectionMeta } from '@/lib/electron';
import { cn } from '@/lib/utils';
import { BrandMark, categoryHeader, type ProviderCategory } from './shared';

export function ConnectionList({
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
