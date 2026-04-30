import { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

type Option<T extends string> = {
  value: T;
  label: string;
  /** Optional second-line subtitle for rich two-line items. */
  description?: string;
};

/**
 * Section header — non-interactive list item used to group options.
 * Visually distinct, not selectable.
 */
type SectionHeader = { header: string };

type ListItem<T extends string> = Option<T> | SectionHeader;

function isHeader<T extends string>(item: ListItem<T>): item is SectionHeader {
  return 'header' in item;
}

type Props<T extends string> = {
  value: T;
  onChange: (value: T) => void;
  options: ListItem<T>[];
  /** "compact" matches inline use in settings rows; "full" stretches to fill. */
  variant?: 'compact' | 'full';
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  /** Pixel width of the open menu. */
  menuWidth?: number;
};

export function Select<T extends string>({
  value,
  onChange,
  options,
  variant = 'full',
  className,
  disabled,
  placeholder = 'Select…',
  menuWidth = 260,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const selected = options.find(
    (o): o is Option<T> => !isHeader(o) && o.value === value,
  );

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild disabled={disabled}>
        <button
          type="button"
          className={cn(
            'inline-flex items-center justify-between gap-2 rounded-md border border-border text-sm text-fg outline-none transition-colors',
            'hover:bg-elevated focus-visible:border-border-strong',
            'disabled:cursor-not-allowed disabled:opacity-60',
            variant === 'compact'
              ? 'bg-elevated/60 pl-3 pr-2 py-1.5'
              : 'w-full bg-elevated/40 pl-2.5 pr-2 py-2',
            open && 'bg-elevated',
            className,
          )}
        >
          <span className="truncate">{selected?.label ?? placeholder}</span>
          <ChevronDown
            className="h-3.5 w-3.5 shrink-0 text-fg-subtle"
            strokeWidth={1.75}
          />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={4}
          collisionPadding={8}
          style={{ width: menuWidth }}
          className="z-50 overflow-hidden rounded-lg border border-border bg-panel p-1 shadow-2xl"
        >
          <div className="scroll-thin max-h-72 space-y-0.5 overflow-auto">
            {options.length === 0 ? (
              <div className="px-2.5 py-3 text-center text-sm text-fg-subtle">
                No options
              </div>
            ) : (
              options.map((opt, idx) => {
                if (isHeader(opt)) {
                  return (
                    <div
                      key={`__h_${idx}_${opt.header}`}
                      className={cn(
                        'px-2.5 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-fg-subtle',
                        // Tighter top spacing for the very first header.
                        idx === 0 && 'pt-1',
                      )}
                    >
                      {opt.header}
                    </div>
                  );
                }
                const isSelected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                    className={cn(
                      'flex w-full items-start justify-between gap-3 rounded-md px-2.5 py-2 text-left transition-colors',
                      'hover:bg-elevated',
                      isSelected && 'bg-elevated/60',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-fg">{opt.label}</div>
                      {opt.description && (
                        <div className="mt-0.5 truncate text-xs text-fg-subtle">
                          {opt.description}
                        </div>
                      )}
                    </div>
                    {isSelected && (
                      <Check
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fg"
                        strokeWidth={2}
                      />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
