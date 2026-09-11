// Drilled-in view of the popover: the model list for one connection.
import { Check, ChevronLeft, Eye, EyeOff } from 'lucide-react';
import type { ConnectionMeta } from '@/lib/electron';
import { cn } from '@/lib/utils';
import { compactNumber } from '../message-list/utils';

export function ModelList({
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
                    {m.supportsVision ? (
                      <span title="Vision supported">
                        <Eye
                          className="h-3.5 w-3.5 shrink-0 text-fg-muted"
                          strokeWidth={1.75}
                        />
                      </span>
                    ) : (
                      <span title="No vision support">
                        <EyeOff
                          className="h-3.5 w-3.5 shrink-0 text-fg-subtle opacity-40"
                          strokeWidth={1.75}
                        />
                      </span>
                    )}
                  </div>
                  {(m.description || m.contextWindow > 0) && (
                    <div className="mt-0.5 truncate text-xs text-fg-subtle">
                      {m.description}
                      {m.description && m.contextWindow > 0 && ' · '}
                      {m.contextWindow > 0 && (
                        <span className="font-mono">{compactNumber(m.contextWindow)} ctx</span>
                      )}
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
