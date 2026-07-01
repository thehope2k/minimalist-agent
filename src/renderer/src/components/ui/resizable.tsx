import * as React from 'react';
import { GripVertical } from 'lucide-react';
import * as ResizablePrimitive from 'react-resizable-panels';
import { cn } from '@/lib/utils';

function ResizablePanelGroup({
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Group>) {
  return (
    <ResizablePrimitive.Group
      data-slot="resizable-panel-group"
      className={cn('flex h-full w-full', className)}
      {...props}
    />
  );
}

const ResizablePanel = ResizablePrimitive.Panel;

function ResizableHandle({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Separator> & {
  withHandle?: boolean;
}) {
  return (
    <ResizablePrimitive.Separator
      data-slot="resizable-handle"
      className={cn(
        // Default: vertical separator (lives in a horizontal group).
        // flex-1 cross-axis fills full height automatically in a flex row.
        'group relative flex w-1.5 shrink-0 items-center justify-center bg-app transition-colors',
        // Horizontal separator (lives in a vertical group).
        // v4 sets aria-orientation="horizontal" when the GROUP is vertical.
        'aria-[orientation=horizontal]:h-1.5 aria-[orientation=horizontal]:w-full',
        // Visual 1px line — vertical by default (pseudo-element).
        'after:pointer-events-none after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-border',
        'hover:after:bg-border-strong data-[separator=active]:after:bg-accent',
        // Override pseudo-element to a horizontal line when aria-orientation=horizontal.
        'aria-[orientation=horizontal]:after:inset-y-[auto] aria-[orientation=horizontal]:after:top-1/2 aria-[orientation=horizontal]:after:bottom-auto',
        'aria-[orientation=horizontal]:after:inset-x-0 aria-[orientation=horizontal]:after:left-0',
        'aria-[orientation=horizontal]:after:h-px aria-[orientation=horizontal]:after:w-full',
        'aria-[orientation=horizontal]:after:translate-x-0 aria-[orientation=horizontal]:after:-translate-y-1/2',
        className,
      )}
      {...props}
    >
      {withHandle && (
        <div className="z-10 flex h-4 w-3 items-center justify-center rounded-sm border border-border bg-elevated">
          <GripVertical className="size-2.5 text-fg-muted" />
        </div>
      )}
    </ResizablePrimitive.Separator>
  );
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
