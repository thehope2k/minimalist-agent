// Generic edit-skill dialog. Two modes:
//
//   - 'metadata'      — agent rewrites the YAML frontmatter only.
//   - 'instructions'  — agent rewrites the markdown body only.
//
// Mirrors Craft's EditPopover behavior with `skill-metadata` /
// `skill-instructions` configs but built on our existing seed-submission
// pipeline: the dialog assembles a scaffold prompt and routes it to a
// fresh chat. No hidden mini-session.

import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Pencil, X } from 'lucide-react';
import { getSkillsReferenceDocPath } from '@/lib/skills';
import { cn } from '@/lib/utils';
import type { LoadedSkill } from '@/lib/electron';
import type { SeedSubmit } from '@/App';

export type EditSkillMode = 'metadata' | 'instructions';

const COPY: Record<
  EditSkillMode,
  {
    title: string;
    subtitle: string;
    placeholder: string;
    intentTag: string;
    chipLabel: string;
  }
> = {
  metadata: {
    title: 'Edit metadata',
    subtitle:
      "Describe the change — the agent will update the SKILL.md frontmatter and leave the body alone.",
    placeholder: 'Tighten the description to one sentence',
    intentTag: 'edit-skill-metadata',
    chipLabel: 'Edit metadata',
  },
  instructions: {
    title: 'Edit instructions',
    subtitle:
      'Describe the change — the agent will rewrite the markdown body and preserve the frontmatter.',
    placeholder: 'Add a section on error handling',
    intentTag: 'edit-skill-instructions',
    chipLabel: 'Edit instructions',
  },
};

export function EditSkillDialog({
  open,
  mode,
  skill,
  onClose,
  onSubmit,
}: {
  open: boolean;
  mode: EditSkillMode;
  skill: LoadedSkill;
  onClose: () => void;
  onSubmit: (submit: SeedSubmit) => void;
}) {
  const [description, setDescription] = useState('');
  const [refDocPath, setRefDocPath] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const copy = COPY[mode];

  useEffect(() => {
    if (!open) return;
    setDescription('');
    void getSkillsReferenceDocPath().then(setRefDocPath);
    requestAnimationFrame(() => taRef.current?.focus());
  }, [open]);

  if (!open) return null;

  const canSubmit = description.trim().length > 0 && !!refDocPath;
  const handleSubmit = () => {
    if (!canSubmit || !refDocPath) return;
    const desc = description.trim();
    onSubmit({
      displayText: desc,
      agentText: buildEditPrompt(mode, desc, skill, refDocPath),
      intentTag: copy.intentTag,
    });
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-app/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[min(560px,calc(100vw-32px))] overflow-hidden rounded-xl border border-border bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
          <Pencil className="h-4 w-4 text-accent" strokeWidth={1.75} />
          <h2 className="flex-1 text-sm font-medium text-fg">
            {copy.title} · {skill.metadata.name}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-fg-subtle hover:bg-elevated hover:text-fg"
            aria-label="Close"
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </header>

        <div className="px-4 pt-4">
          <h3 className="text-base font-medium text-fg">
            What would you like to change?
          </h3>
          <p className="mt-0.5 text-xs text-fg-subtle">{copy.subtitle}</p>
        </div>

        <div className="px-4 pt-3">
          <textarea
            ref={taRef}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={copy.placeholder}
            rows={4}
            className="block w-full resize-none rounded-lg border border-border bg-elevated/60 px-3 py-2 text-sm text-fg placeholder:text-fg-subtle outline-none focus:border-accent/60"
          />
        </div>

        <div className="px-4 pt-3 pb-1">
          <p className="truncate font-mono text-[11px] text-fg-subtle">
            → {skill.path}/SKILL.md
          </p>
        </div>

        <footer className="mt-3 flex items-center justify-end gap-2 border-t border-border/60 bg-elevated/30 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-fg-muted hover:bg-elevated hover:text-fg"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleSubmit}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium',
              'bg-accent text-accent-fg hover:bg-accent-hover',
              'disabled:cursor-not-allowed disabled:bg-elevated disabled:text-fg-subtle',
            )}
          >
            Apply <ArrowUp className="h-3.5 w-3.5" strokeWidth={2.5} />
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ---------- prompt builder ---------- */

function buildEditPrompt(
  mode: EditSkillMode,
  description: string,
  skill: LoadedSkill,
  refDocPath: string,
): string {
  const target = `${skill.path}/SKILL.md`;
  if (mode === 'metadata') {
    return `<skill_edit_metadata>
<reference_doc>${refDocPath}</reference_doc>
<target_file>${target}</target_file>
<slug>${skill.slug}</slug>
</skill_edit_metadata>

Read the reference doc at \`<reference_doc>\` for the SKILL.md format. Then edit ONLY the YAML frontmatter at the top of \`<target_file>\` per the user's request. Preserve the markdown body unchanged. Read the file back to confirm it parses, then briefly summarize what you changed.

User request: ${description}`;
  }
  return `<skill_edit_instructions>
<reference_doc>${refDocPath}</reference_doc>
<target_file>${target}</target_file>
<slug>${skill.slug}</slug>
</skill_edit_instructions>

Read the reference doc at \`<reference_doc>\` for the SKILL.md format and body conventions. Then edit ONLY the markdown body of \`<target_file>\` (everything after the closing \`---\` of the YAML frontmatter). Preserve the frontmatter unchanged. Read the file back to confirm it parses, then briefly summarize what you changed.

User request: ${description}`;
}
