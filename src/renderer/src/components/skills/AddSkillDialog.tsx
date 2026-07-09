// "+ New Skill" dialog. The user provides:
//   - a free-text description of what the skill should do
//   - a slug (name of the directory under <userData>/skills/)
//
// Clicking "Build skill" assembles a scaffold prompt and routes it to a
// fresh chat, where the agent uses its `Write` tool to create SKILL.md
// at the requested location. Slug + path are user-controlled — no
// surprises.

import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Sparkles, X } from 'lucide-react';
import { getSkillsDir, getSkillsReferenceDocPath } from '@/lib/skills';
import { cn } from '@/lib/utils';
import type { SeedSubmit } from '@/App';

const PLACEHOLDERS = [
  'Review PRs following our code standards',
  "Write commit messages with our team's tone",
  'Generate test cases for any function I paste',
  'Explain SQL queries in plain English',
];

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,29}$/;

export function AddSkillDialog({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (submit: SeedSubmit) => void;
}) {
  const [description, setDescription] = useState('');
  const [slug, setSlug] = useState('');
  const [skillsDir, setSkillsDir] = useState<string | null>(null);
  const [refDocPath, setRefDocPath] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  // Pick a placeholder once when the dialog opens; recomputing on every
  // render would reshuffle the text whenever the user moves the mouse.
  const [placeholder, setPlaceholder] = useState(PLACEHOLDERS[0]);

  useEffect(() => {
    if (!open) return;
    setDescription('');
    setSlug('');
    setPlaceholder(
      PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)],
    );
    void getSkillsDir().then(setSkillsDir);
    void getSkillsReferenceDocPath().then(setRefDocPath);
    requestAnimationFrame(() => taRef.current?.focus());
  }, [open]);

  if (!open) return null;

  const slugError =
    slug.length > 0 && !SLUG_RE.test(slug)
      ? 'Lowercase, hyphenated, ≤30 chars (e.g. `sql-explainer`).'
      : null;
  const canSubmit =
    description.trim().length > 0 &&
    (slug.length === 0 || SLUG_RE.test(slug)) &&
    !!skillsDir &&
    !!refDocPath;

  const handleSubmit = () => {
    if (!canSubmit || !skillsDir || !refDocPath) return;
    const desc = description.trim();
    onSubmit({
      // What the user sees in the chat — just their description.
      displayText: desc,
      // What the agent receives — wraps the description in scaffold context.
      agentText: buildScaffoldPrompt(desc, slug, skillsDir, refDocPath),
      intentTag: 'add-skill',
    });
    onClose();
  };

  const onTextareaKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
          <Sparkles className="h-4 w-4 text-accent" strokeWidth={1.75} />
          <h2 className="flex-1 text-sm font-medium text-fg">New Skill</h2>
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
            What would you like to teach?
          </h3>
          <p className="mt-0.5 text-xs text-fg-subtle">
            Describe it — the agent will scaffold the SKILL.md for you.
          </p>
        </div>

        <div className="px-4 pt-3">
          <textarea
            ref={taRef}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={onTextareaKey}
            placeholder={placeholder}
            rows={4}
            className="block w-full resize-none rounded-lg border border-border bg-elevated/60 px-3 py-2 text-sm text-fg placeholder:text-fg-subtle outline-none focus:border-accent/60"
          />
        </div>

        <div className="px-4 pt-3">
          <label className="block text-[11px] uppercase tracking-wide text-fg-subtle">
            Slug
          </label>
          <input
            type="text"
            value={slug}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            onChange={(e) => setSlug(e.target.value)}
            placeholder="optional — agent will choose if blank"
            className={cn(
              'mt-1 block w-full rounded-md border bg-elevated/60 px-2.5 py-1.5 font-mono text-sm text-fg outline-none',
              slugError ? 'border-red-500/60' : 'border-border focus:border-accent/60',
            )}
          />
          {slugError ? (
            <p className="mt-1 text-[11px] text-red-300">{slugError}</p>
          ) : slug.length > 0 ? (
            <p className="mt-1 truncate font-mono text-[11px] text-fg-subtle">
              → {skillsDir ? `${skillsDir}/${slug}/SKILL.md` : '…'}
            </p>
          ) : null}
        </div>

        <footer className="mt-4 flex items-center justify-end gap-2 border-t border-border/60 bg-elevated/30 px-4 py-3">
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
            Build skill <ArrowUp className="h-3.5 w-3.5" strokeWidth={2.5} />
          </button>
        </footer>
      </div>
    </div>
  );
}

/**
 * Build the scaffold prompt sent to the agent. Short and focused — the
 * comprehensive format reference lives in `<refDocPath>` and the agent
 * is instructed to Read it before writing.
 */
function buildScaffoldPrompt(
  description: string,
  slug: string,
  skillsDir: string,
  refDocPath: string,
): string {
  const slugInstructions = slug
    ? `Use the slug \`${slug}\` — create the skill at \`${skillsDir}/${slug}/SKILL.md\` exactly (do NOT change the slug or location).`
    : `Choose an appropriate slug (lowercase, hyphenated, ≤30 chars — e.g. \`pr-review\`) that clearly reflects what the skill does, then create it at \`${skillsDir}/<chosen-slug>/SKILL.md\`.`;
  return `<skill_create>
<reference_doc>${refDocPath}</reference_doc>
<skills_dir>${skillsDir}</skills_dir>
${slug ? `<slug>${slug}</slug>` : ''}
</skill_create>

Read the reference doc at \`<reference_doc>\` first — it covers the SKILL.md format, frontmatter fields, slug rules, body conventions, and examples. Then ${slugInstructions} Validate it parses by reading it back, and briefly summarize what you built.

User wants a skill that will: ${description}`;
}
