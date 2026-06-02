import { Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Markdown } from '../../chat/parts/markdown/Markdown';
import type { LoadedSkill } from '@/lib/electron';

interface InstructionsSectionProps {
  skill: LoadedSkill;
  onEdit: () => void;
  disabled?: boolean;
}

export function InstructionsSection({ skill, onEdit, disabled }: InstructionsSectionProps) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-fg">Instructions</h2>
        <EditButton onClick={onEdit} disabled={disabled} />
      </div>
      <div className="overflow-hidden rounded-lg border border-border/50 bg-elevated/20">
        <div className="markdown px-4 py-4">
          <Markdown text={skill.content} />
        </div>
      </div>
    </section>
  );
}

function EditButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border border-border/60 bg-elevated/60 px-2 py-0.5 text-xs',
        disabled
          ? 'cursor-not-allowed text-fg-subtle opacity-50'
          : 'text-fg-muted hover:bg-elevated hover:text-fg',
      )}
    >
      <Pencil className="h-3 w-3" strokeWidth={1.75} /> Edit
    </button>
  );
}
