import { Circle } from 'lucide-react';
import { cn } from '@/lib/utils';

type NewSessionRowProps = {
  active: boolean;
  onSelect?: () => void;
};

export function NewSessionRow({ active, onSelect }: NewSessionRowProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
        active ? 'bg-elevated' : 'hover:bg-elevated/60 text-fg-muted',
      )}
    >
      {active && <span className="absolute inset-y-1.5 left-0 z-10 w-0.5 rounded-r-sm bg-accent" />}
      <Circle
        className={cn('h-4 w-4 shrink-0', active ? 'text-fg-subtle' : 'text-fg-subtle/50')}
        strokeWidth={1.75}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={cn('flex-1 truncate text-[0.95rem]', active ? 'text-fg' : 'text-fg-muted')}
          >
            New session
          </span>
          {active && <span className="shrink-0 text-xs text-fg-subtle">now</span>}
        </div>
      </div>
    </button>
  );
}
