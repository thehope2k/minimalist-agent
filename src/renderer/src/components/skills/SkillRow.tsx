import { useState } from 'react';
import { cn } from '@/lib/utils';
import { DragHandle, type DragHandleProps } from '@/components/ui';
import { SkillAvatar } from './SkillAvatar';
import { SkillMenu } from './SkillMenu';
import type { LoadedSkill } from '@/lib/electron';

type Props = {
  skill: LoadedSkill;
  active: boolean;
  dragHandle: DragHandleProps;
  onClick: () => void;
  onAfterDelete: () => void;
};

export function SkillRow({ skill, active, dragHandle, onClick, onAfterDelete }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="group/skill relative border-b border-border last:border-b-0">
      {active && (
        <span className="absolute inset-y-2 left-0 z-10 w-0.5 rounded-r-sm bg-accent" />
      )}
      <div className="flex items-stretch">
        <div className="flex w-5 shrink-0 items-center justify-center">
          <DragHandle
            dragHandle={dragHandle}
            className="opacity-50 transition-opacity hover:opacity-100 group-hover/skill:opacity-100"
          />
        </div>
        <button
          onClick={onClick}
          className={cn(
            'flex min-w-0 flex-1 items-start gap-3 py-2.5 pr-3 pl-1 text-left transition-colors',
            active ? 'bg-elevated' : 'hover:bg-elevated/60',
          )}
        >
          <SkillAvatar skill={skill} size="md" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[0.95rem] font-medium text-fg">
              {skill.metadata.name}
            </div>
            <div className="mt-0.5 truncate text-xs text-fg-subtle">
              {skill.metadata.description}
            </div>
          </div>
        </button>
      </div>

      <div
        className={cn(
          'absolute right-2 top-2 transition-opacity',
          'opacity-0 group-hover/skill:opacity-100',
          menuOpen && 'opacity-100',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <SkillMenu
          skill={skill}
          onAfterDelete={onAfterDelete}
          onOpenChange={setMenuOpen}
        />
      </div>
    </div>
  );
}
