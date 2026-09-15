import { PinOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LoadedSkill } from '@/lib/electron';
import { SkillAvatar } from '@/components/skills';
import { ItemRow } from './ItemRow';

interface PinnedSectionProps {
  pinnedSkills: LoadedSkill[];
  tokenEstimate: number;
  tokenWarning: boolean;
  onUnpin: (scopedSlug: string) => void;
  onOpenSkill: (skill: LoadedSkill) => void;
}

export function PinnedSection({
  pinnedSkills,
  tokenEstimate,
  tokenWarning,
  onUnpin,
  onOpenSkill,
}: PinnedSectionProps) {
  const hasItems = pinnedSkills.length > 0;

  return (
    <div className="border-b border-border pb-2">
      <div className="flex items-center gap-1.5 px-3 py-2">
        <span className="text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
          Active this session
        </span>
        {tokenEstimate > 0 && (
          <span
            className={cn(
              'ml-auto text-[10px] tabular-nums',
              tokenWarning ? 'text-amber-500' : 'text-fg-subtle',
            )}
          >
            ~{tokenEstimate.toLocaleString()} tok
          </span>
        )}
      </div>

      {tokenWarning && (
        <div className="mx-3 mb-2 rounded-md bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-600 dark:text-amber-400">
          ⚠ High token usage — consider unpinning unused items
        </div>
      )}

      {!hasItems && (
        <p className="px-3 pb-2 text-xs text-fg-subtle">
          Nothing pinned yet. Pin a skill below to keep it in context every turn.
        </p>
      )}

      {pinnedSkills.map((skill) => (
        <ItemRow
          key={`skill:${skill.slug}`}
          avatar={<SkillAvatar skill={skill} size="sm" />}
          name={skill.metadata.name}
          slug={skill.slug}
          description={skill.metadata.description}
          onOpen={() => onOpenSkill(skill)}
          badge={
            skill.source === 'project' ? (
              <span className="shrink-0 text-[9px] font-medium uppercase tracking-wide text-fg-subtle">
                project
              </span>
            ) : undefined
          }
          action={
            <button
              type="button"
              onClick={() => onUnpin(`${skill.source}:${skill.slug}`)}
              className="shrink-0 rounded p-1 text-fg-subtle opacity-0 hover:bg-elevated hover:text-fg group-hover:opacity-100"
              title={`Unpin ${skill.slug}`}
            >
              <PinOff className="h-3 w-3" strokeWidth={1.75} />
            </button>
          }
        />
      ))}
    </div>
  );
}
