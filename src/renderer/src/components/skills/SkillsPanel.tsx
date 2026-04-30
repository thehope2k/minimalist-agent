// Middle-column list of installed skills. One row per skill with avatar,
// name, description, tier badge, and a hover ⋯ menu.
//
// Empty state explains where to drop SKILL.md files (since v1 has no
// in-app authoring UI — file-system first).

import { useEffect, useState } from 'react';
import { Plus, RefreshCw, Sparkles } from 'lucide-react';
import { useSkills } from '@/hooks/useSkills';
import { reload as reloadSkills } from '@/lib/skills';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui';
import { SkillAvatar } from './SkillAvatar';
import { SkillMenu } from './SkillMenu';
import { AddSkillDialog } from './AddSkillDialog';
import type { LoadedSkill } from '@/lib/electron';

import type { SeedSubmit } from '@/App';

type Props = {
  /** Currently-selected slug (drives info-page rendering on the right). */
  activeSlug: string | null;
  onSelect: (slug: string | null) => void;
  /** Opens a fresh chat with a structured submission (used by "+ New Skill"). */
  onStartChatWithSubmission?: (submit: SeedSubmit) => void;
};

export function SkillsPanel({
  activeSlug,
  onSelect,
  onStartChatWithSubmission,
}: Props) {
  const skills = useSkills();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Bust the cache when the panel mounts so freshly-written SKILL.md
  // files (e.g. from the agent's `Write` tool) show up immediately.
  useEffect(() => {
    void reloadSkills();
  }, []);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    try {
      await reloadSkills();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3 text-[15px] font-semibold text-fg">
        <Sparkles className="h-4 w-4 text-fg-muted" strokeWidth={1.75} />
        <span>Skills</span>
        {skills && (
          <span className="text-xs tabular-nums text-fg-subtle">
            {skills.length}
          </span>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={handleManualRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-1 rounded-md p-1 text-fg-subtle hover:bg-elevated hover:text-fg disabled:opacity-50"
          title="Refresh skill list"
          aria-label="Refresh"
        >
          <RefreshCw
            className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')}
            strokeWidth={1.75}
          />
        </button>
        <Button
          variant="outline"
          size="sm"
          icon={Plus}
          onClick={() => setDialogOpen(true)}
          title="Build a new skill by chatting with the agent"
          className="border-accent/40 bg-accent/10 text-accent hover:bg-accent/20 hover:text-accent"
        >
          New
        </Button>
      </header>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-2">
        {skills === null ? (
          <div className="px-2 py-3 text-sm text-fg-subtle">Loading…</div>
        ) : skills.length === 0 ? (
          <EmptyState onAdd={() => setDialogOpen(true)} />
        ) : (
          skills.map((skill) => (
            <SkillRow
              key={skill.slug}
              skill={skill}
              active={skill.slug === activeSlug}
              onClick={() => onSelect(skill.slug)}
              onAfterDelete={() => {
                if (skill.slug === activeSlug) onSelect(null);
              }}
            />
          ))
        )}
      </div>

      <AddSkillDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSubmit={(submit) => onStartChatWithSubmission?.(submit)}
      />
    </div>
  );
}

function SkillRow({
  skill,
  active,
  onClick,
  onAfterDelete,
}: {
  skill: LoadedSkill;
  active: boolean;
  onClick: () => void;
  onAfterDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="group/skill relative border-b border-border last:border-b-0">
      {active && (
        <span className="absolute inset-y-2 left-0 z-10 w-0.5 rounded-r-sm bg-accent" />
      )}
      <button
        onClick={onClick}
        className={cn(
          'flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors',
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

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      <Sparkles className="h-6 w-6 text-fg-subtle" strokeWidth={1.5} />
      <div className="text-sm font-medium text-fg">No skills yet</div>
      <p className="max-w-65 text-xs text-fg-subtle">
        Skills are reusable instruction sets. Describe what you want one to
        do — the agent will scaffold it for you.
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:bg-accent-hover"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2.5} /> New Skill
      </button>
    </div>
  );
}
