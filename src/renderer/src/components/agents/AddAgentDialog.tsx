// "+ New Agent" dialog. The user provides:
//   - a free-text description of what the agent should do
//   - a slug (name of the directory under ~/.minimalist-agent/agents/)
//
// Clicking "Build agent" assembles a scaffold prompt and routes it to a
// fresh chat, where the model creates AGENT.md with Write tool. Slug is
// optional — if left blank the agent picks a suitable one.

import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Bot, X } from 'lucide-react';
import { getAgentsDir } from '@/lib/agents';
import { cn } from '@/lib/utils';
import type { SeedSubmit } from '@/App';

const PLACEHOLDERS = [
  'Read-only code analyzer, no writing',
  'Plans refactoring changes step-by-step',
  'Tests code with bash, no other tools',
  'Reviews for security issues',
  'Explains complex code sections',
];

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,29}$/;

export function AddAgentDialog({
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
  const [agentsDir, setAgentsDir] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const [placeholder, setPlaceholder] = useState(PLACEHOLDERS[0]);

  useEffect(() => {
    if (!open) return;
    setDescription('');
    setSlug('');
    setPlaceholder(
      PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)],
    );
    void getAgentsDir().then(setAgentsDir);
    requestAnimationFrame(() => taRef.current?.focus());
  }, [open]);

  if (!open) return null;

  const slugError =
    slug.length > 0 && !SLUG_RE.test(slug)
      ? 'Lowercase, hyphenated, ≤30 chars (e.g. `code-reviewer`).'
      : null;
  const canSubmit =
    description.trim().length > 0 &&
    (slug.length === 0 || SLUG_RE.test(slug)) &&
    !!agentsDir;

  const handleSubmit = () => {
    if (!canSubmit || !agentsDir) return;
    const desc = description.trim();
    onSubmit({
      displayText: desc,
      agentText: buildAgentScaffoldPrompt(desc, slug, agentsDir),
      intentTag: 'add-agent',
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
          <Bot className="h-4 w-4 text-accent" strokeWidth={1.75} />
          <h2 className="flex-1 text-sm font-medium text-fg">New Agent</h2>
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
            What should this agent do?
          </h3>
          <p className="mt-0.5 text-xs text-fg-subtle">
            Describe it — the agent will scaffold the AGENT.md for you.
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
              → {agentsDir ? `${agentsDir}/${slug}/AGENT.md` : '…'}
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
            Build agent <ArrowUp className="h-3.5 w-3.5" strokeWidth={2.5} />
          </button>
        </footer>
      </div>
    </div>
  );
}

/**
 * Build the prompt that coaches the model to create an AGENT.md file.
 * The format spec is inlined here — no static reference doc on disk.
 */
function buildAgentScaffoldPrompt(
  description: string,
  slug: string,
  agentsDir: string,
): string {
  const chosenSlug = slug || '<chosen-slug>';
  const target = `${agentsDir}/${chosenSlug}/AGENT.md`;
  const slugInstructions = slug
    ? `Slug must match the directory name: \`${slug}\``
    : `Choose an appropriate slug (lowercase, hyphenated, ≤30 chars — e.g. \`code-reviewer\`) that clearly reflects what the agent does, and use it as the directory name.`;
  return `<agent_create>
<agents_dir>${agentsDir}</agents_dir>
${slug ? `<slug>${slug}</slug>` : ''}
</agent_create>

Create the AGENT.md file with this exact structure:

\`\`\`markdown
---
name: "Display Name"
description: "One sentence — what this agent does. The model uses this to decide when to spawn it."
# model: omit unless the user explicitly asked for a specific model ID.
#        If set, use the FULL provider model ID (e.g. claude-sonnet-4, gpt-4o).
#        Short names like "haiku" or "sonnet" are NOT valid and will fail.
tools: [Read, Grep, Find]   # optional — restrict from: Read Write Edit Bash Grep Find Ls WebFetch WebSearch Agent
maxTurns: 10                # optional — default 10
permissionMode: plan        # optional — "plan" (no mutations) or "auto" (intelligent autonomy)
effort: low                 # optional — Anthropic only: low | medium | high
icon: "🔍"                  # optional — emoji or URL
---

System prompt body goes here. Be specific, set constraints, define output format.
\`\`\`

Rules:
- \`name\` and \`description\` are required; all other fields are optional
- Omit \`model\` unless the user asked for one — the agent inherits the session model
- ${slugInstructions}
- Place the file at \`${target}\`
- After writing, read the file back to confirm it looks correct, then briefly summarize what you built

User wants an agent that will: ${description}`;
}
