// Lightweight popover menu — used for row context menus (sessions, connections).
// Mirrors the Select component's Radix Popover usage.

import { useState, type ReactNode } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { cn } from '@/lib/utils';

export interface MenuItem {
  label: string;
  icon?: React.ElementType;
  /** Visual variant for the item — default vs destructive. */
  variant?: 'default' | 'destructive';
  onSelect: () => void;
}

type Props = {
  /** The element that opens the menu (typically an IconButton). */
  trigger: ReactNode;
  items: Array<MenuItem | 'separator'>;
  /** Pixel width of the menu. */
  menuWidth?: number;
  /** When provided, the menu becomes fully controlled by the parent. */
  open?: boolean;
  /** Notify parents when the menu opens/closes — used to keep hover-revealed
   *  triggers visible while the menu is open. Required when `open` is provided. */
  onOpenChange?: (open: boolean) => void;
};

export function Menu({ trigger, items, menuWidth = 192, open: openProp, onOpenChange }: Props) {
  const [openInternal, setOpenInternal] = useState(false);
  // If the parent passes `open`, use controlled mode; otherwise self-manage.
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : openInternal;
  const setOpen = (v: boolean) => {
    if (!controlled) setOpenInternal(v);
    onOpenChange?.(v);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={4}
          collisionPadding={8}
          style={{ width: menuWidth }}
          className="z-50 overflow-hidden rounded-lg border border-border bg-panel p-1 shadow-2xl"
        >
          {items.map((item, i) =>
            item === 'separator' ? (
              <div key={`sep-${i}`} className="my-1 h-px bg-border" />
            ) : (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors',
                  'hover:bg-elevated',
                  item.variant === 'destructive'
                    ? 'text-red-300 hover:text-red-200'
                    : 'text-fg',
                )}
              >
                {item.icon && (
                  <item.icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                )}
                <span className="flex-1 truncate">{item.label}</span>
              </button>
            ),
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
