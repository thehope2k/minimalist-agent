import * as RadixTooltip from '@radix-ui/react-tooltip';
import { cn } from '@/lib/utils';

/**
 * App-wide tooltip provider — mount once at the root (App.tsx).
 * `delayDuration` is set to 400 ms (vs the native title's ~1 s OS delay).
 */
export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return (
    <RadixTooltip.Provider delayDuration={400} skipDelayDuration={100}>
      {children}
    </RadixTooltip.Provider>
  );
}

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  className?: string;
}

/**
 * Lightweight tooltip wrapper. Usage:
 *
 *   <Tooltip content="Save file (Cmd+S)">
 *     <IconButton icon={Save} />
 *   </Tooltip>
 *
 * Or use IconButton's `label` prop directly — it wraps itself automatically.
 */
export function Tooltip({
  content,
  children,
  side = 'bottom',
  align = 'center',
  className,
}: TooltipProps) {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          align={align}
          sideOffset={6}
          className={cn(
            'z-50 max-w-xs rounded-md border border-border bg-elevated-2 px-2.5 py-1.5',
            'text-xs text-fg shadow-lg',
            'animate-in fade-in-0 zoom-in-95',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
            'data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2',
            'data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2',
            className,
          )}
        >
          {content}
          <RadixTooltip.Arrow className="fill-elevated-2" />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
