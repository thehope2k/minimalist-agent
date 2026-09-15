import { Pin, PinOff, Plus } from 'lucide-react';
import { useState } from 'react';
import type { LoadedSkill } from '@/lib/electron';
import { SkillAvatar } from '@/components/skills';
import { ItemRow } from './ItemRow';

export interface AvailableSectionProps {
  title: string;
  skills: LoadedSkill[];
  isPinned: (scope: 'user' | 'project', slug: string) => boolean;
  onPin: (scopedSlug: string) => void;
  onUnpin: (scopedSlug: string) => void;
  onOpenSkill: (skill: LoadedSkill) => void;
  cwd?: string;
  onNew?: (type: 'skill' | 'extension') => void;
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
  const [menuOpen, setMenuOpen] = useState(false);
  const hasItems = skills.length > 0;

  return (
    <div className="border-b border-border pb-2 last:border-0">
      <div className="flex items-center gap-1.5 px-3 py-2">
        <span className="flex-1 text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
          {title}
        </span>
        {onNew && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="inline-flex items-center gap-1 rounded-md border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[11px] font-medium text-accent hover:bg-accent/20"
              title="New project asset"
            >
              <Plus className="h-3 w-3" strokeWidth={2.5} />
              New
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full z-50 mt-1 w-36 overflow-hidden rounded-lg border border-border bg-panel shadow-xl">
                  {(['skill', 'extension'] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onNew(type);
                      }}
                      className="flex w-full items-center px-3 py-1.5 text-left text-sm text-fg hover:bg-elevated capitalize"
                    >
                      New {type}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {!hasItems && <p className="px-3 pb-2 text-xs text-fg-subtle">No skills yet.</p>}

      {skills.map((skill) => {
        const pinned = isPinned(skill.source as 'user' | 'project', skill.slug);
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
