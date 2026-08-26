// Small drag-affordance button attached to a SortableList row's dragHandle
// props. Kept separate from SortableList itself so row components (Skill /
// Agent / Extension rows) don't each re-implement the same grip markup.

import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DragHandleProps } from './SortableList';

interface Props {
  dragHandle: DragHandleProps;
  className?: string;
}

export function DragHandle({ dragHandle, className }: Props) {
  const { attributes, listeners, setActivatorNodeRef, isDragging } = dragHandle;

  return (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label="Drag to reorder"
      className={cn(
        'touch-none rounded p-0.5 text-fg-subtle hover:bg-elevated hover:text-fg',
        isDragging ? 'cursor-grabbing' : 'cursor-grab',
        className,
      )}
    >
      <GripVertical className="h-3.5 w-3.5" strokeWidth={1.75} />
    </button>
  );
}
