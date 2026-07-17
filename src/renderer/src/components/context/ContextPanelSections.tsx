import { Pin, PinOff, Plus } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { LoadedSkill, LoadedExtension } from '@/lib/electron';
import { displayName as extensionDisplayName, displayDescription as extensionDisplayDescription } from '@/lib/extensions';
import { SkillAvatar } from '@/components/skills/SkillAvatar';
import { ExtensionAvatar } from '@/components/extensions/ExtensionAvatar';

/* ---------- Shared row ---------- */

/**
 * Single row shape used across all three sections.
 * name + @slug + description — consistent everywhere.
 */
function ItemRow({
  avatar,
  name,
  slug,
  description,
  badge,
  action,
}: {
  avatar: React.ReactNode;
  name: string;
  slug?: string;
  description?: string;
  badge?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="group flex items-center gap-2 px-3 py-1.5">
      {avatar}
      <span
        className="min-w-0 flex-1 truncate text-sm text-fg"
        title={description}
      >
        {name}
      </span>
      {badge}
      {slug && (
        <span className="shrink-0 font-mono text-[10px] text-fg-subtle">@{slug}</span>
      )}
      {action}
    </div>
  );
}

/* ---------- Pinned section ---------- */

interface PinnedSectionProps {
  pinnedSkills: LoadedSkill[];
  tokenEstimate: number;
  tokenWarning: boolean;
  onUnpin: (scopedSlug: string) => void;
}

export function PinnedSection({
  pinnedSkills,
  tokenEstimate,
  tokenWarning,
  onUnpin,
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

/* ---------- Available section ---------- */

export interface AvailableSectionProps {
  title: string;
  skills: LoadedSkill[];
  isPinned: (scope: 'user' | 'project', slug: string) => boolean;
  onPin: (scopedSlug: string) => void;
  onUnpin: (scopedSlug: string) => void;
  cwd?: string;
  /** When provided, shows a + New dropdown in the section header. */
  onNew?: (type: 'skill' | 'extension') => void;
}

export function AvailableSection({
  title,
  skills,
  isPinned,
  onPin,
  onUnpin,
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
              onClick={() => setMenuOpen((o) => !o)}
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
                      onClick={() => { setMenuOpen(false); onNew(type); }}
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

      {!hasItems && (
        <p className="px-3 pb-2 text-xs text-fg-subtle">
          No skills yet.
        </p>
      )}

      {skills.map((skill) => {
        const pinned = isPinned(skill.source as 'user' | 'project', skill.slug);
        return (
          <ItemRow
            key={`skill:${skill.slug}`}
            avatar={<SkillAvatar skill={skill} size="sm" />}
            name={skill.metadata.name}
            slug={skill.slug}
            description={skill.metadata.description}
            badge={
              pinned ? (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" title="Pinned" />
              ) : undefined
            }
            action={
              <button
                type="button"
                onClick={pinned ? () => onUnpin(`${skill.source}:${skill.slug}`) : () => onPin(`${skill.source}:${skill.slug}`)}
                className="shrink-0 rounded p-1 text-fg-subtle opacity-0 hover:bg-elevated hover:text-fg group-hover:opacity-100"
                title={pinned ? `Unpin ${skill.slug}` : `Pin ${skill.slug}`}
              >
                {pinned
                  ? <PinOff className="h-3 w-3" strokeWidth={1.75} />
                  : <Pin className="h-3 w-3" strokeWidth={1.75} />}
              </button>
            }
          />
        );
      })}

    </div>
  );
}

/* ---------- Extensions section (read-only) ---------- */

interface ExtensionsSectionProps {
  title?: string;
  extensions: LoadedExtension[];
}

export function ExtensionsSection({ title = 'Extensions', extensions }: ExtensionsSectionProps) {
  if (extensions.length === 0) return null;

  return (
    <div className="border-b border-border pb-2 last:border-0">
      <div className="flex items-center gap-1.5 px-3 py-2">
        <span className="text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
          {title}
        </span>
        <span className="text-[10px] tabular-nums text-fg-subtle">{extensions.length}</span>
      </div>
      {extensions.map((ext) => (
        <ItemRow
          key={ext.slug}
          avatar={<ExtensionAvatar extension={ext} size="sm" />}
          name={extensionDisplayName(ext)}
          slug={ext.slug}
          description={extensionDisplayDescription(ext)}
        />
      ))}
    </div>
  );
}
