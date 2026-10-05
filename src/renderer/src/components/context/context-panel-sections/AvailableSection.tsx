import type { LoadedSkill } from '@/lib/electron';
import { SkillAvatar } from '@/components/skills';
import { Pin, PinOff } from 'lucide-react';
import { ItemRow } from './ItemRow';
import { NewAssetButton } from './NewAssetButton';

export interface AvailableSectionProps {
  title: string;
  skills: LoadedSkill[];
  isPinned: (scope: 'user' | 'project', slug: string) => boolean;
  onPin: (scopedSlug: string) => void;
  onUnpin: (scopedSlug: string) => void;
  onOpenSkill: (skill: LoadedSkill) => void;
  cwd?: string;
  onNew?: () => void;
}

export function AvailableSection({
  title,
  skills,
  isPinned,
  onPin,
  onUnpin,
  onOpenSkill,
  onNew,
}: AvailableSectionProps) {
  const hasItems = skills.length > 0;

  return (
    <div className="border-b border-border pb-2 last:border-0">
      <div className="flex items-center gap-1.5 px-3 py-2">
        <span className="flex-1 text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
          {title}
        </span>
        {onNew && <NewAssetButton label="New project skill" onClick={onNew} />}
      </div>

      {!hasItems && <p className="px-3 pb-2 text-xs text-fg-subtle">No skills yet.</p>}

      {skills.map((skill) => {
        const pinned = isPinned(skill.source, skill.slug);
        return (
          <ItemRow
            key={`skill:${skill.slug}`}
            avatar={<SkillAvatar skill={skill} size="sm" />}
            name={skill.metadata.name}
            slug={skill.slug}
            description={skill.metadata.description}
            onOpen={() => onOpenSkill(skill)}
            badge={
              pinned ? (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" title="Pinned" />
              ) : undefined
            }
            action={
              <button
                type="button"
                onClick={
                  pinned
                    ? () => onUnpin(`${skill.source}:${skill.slug}`)
                    : () => onPin(`${skill.source}:${skill.slug}`)
                }
                className="shrink-0 rounded p-1 text-fg-subtle opacity-0 hover:bg-elevated hover:text-fg group-hover:opacity-100"
                title={pinned ? `Unpin ${skill.slug}` : `Pin ${skill.slug}`}
              >
                {pinned ? (
                  <PinOff className="h-3 w-3" strokeWidth={1.75} />
                ) : (
                  <Pin className="h-3 w-3" strokeWidth={1.75} />
                )}
              </button>
            }
          />
        );
      })}
    </div>
  );
}
