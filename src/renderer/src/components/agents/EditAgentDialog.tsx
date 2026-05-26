// Generic edit-agent dialog. Two modes:
//
//   - 'metadata'      — agent rewrites the YAML frontmatter only.
//   - 'instructions'  — agent rewrites the markdown body (system prompt) only.
//
// Mirrors EditSkillDialog behavior: the dialog assembles a scaffold prompt
// and routes it to a fresh chat.

import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Pencil, X } from 'lucide-react';
import { getAgentsReferenceDocPath } from '@/lib/agents';
import { cn } from '@/lib/utils';
import type { LoadedAgent } from '@/lib/electron';
import type { SeedSubmit } from '@/App';

export type EditAgentMode = 'metadata' | 'instructions';

const COPY: Record<
  EditAgentMode,
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
      "Describe the change — the agent will update the AGENT.md frontmatter and leave the system prompt alone.",
    placeholder: 'Change model to haiku and restrict to read-only tools',
    intentTag: 'edit-agent-metadata',
    chipLabel: 'Edit metadata',
  },
  instructions: {
    title: 'Edit system prompt',
    subtitle:
      'Describe the change — the agent will rewrite the markdown body (system prompt) and preserve the frontmatter.',
    placeholder: 'Add stricter guidelines for code review',
    intentTag: 'edit-agent-instructions',
    chipLabel: 'Edit instructions',
  },
};

export function EditAgentDialog({
  open,
  mode,
  agent,
  onClose,
  onSubmit,
}: {
  open: boolean;
  mode: EditAgentMode;
  agent: LoadedAgent;
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
    void getAgentsReferenceDocPath().then(setRefDocPath);
    requestAnimationFrame(() => taRef.current?.focus());
  }, [open]);

  if (!open) return null;

  const canSubmit = description.trim().length > 0 && !!refDocPath;
  const handleSubmit = () => {
    if (!canSubmit || !refDocPath) return;
    const desc = description.trim();
    onSubmit({
      displayText: desc,
      agentText: buildEditPrompt(mode, desc, agent, refDocPath),
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
            {copy.title} · {agent.metadata.name}
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
            → {agent.path}/AGENT.md
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
  mode: EditAgentMode,
  description: string,
  agent: LoadedAgent,
  refDocPath: string,
): string {
  const target = `${agent.path}/AGENT.md`;
  if (mode === 'metadata') {
    return `<agent_edit_metadata>
<reference_doc>${refDocPath}</reference_doc>
<target_file>${target}</target_file>
<slug>${agent.slug}</slug>
</agent_edit_metadata>

Read the reference doc at \`<reference_doc>\` for the AGENT.md format. Then edit ONLY the YAML frontmatter at the top of \`<target_file>\` per the user's request. Preserve the markdown body (system prompt) unchanged. Read the file back to confirm it parses, then briefly summarize what you changed.

User request: ${description}`;
  }
  return `<agent_edit_instructions>
<reference_doc>${refDocPath}</reference_doc>
<target_file>${target}</target_file>
<slug>${agent.slug}</slug>
</agent_edit_instructions>

Read the reference doc at \`<reference_doc>\` for the AGENT.md format and system prompt conventions. Then edit ONLY the markdown body of \`<target_file>\` (everything after the closing \`---\` of the YAML frontmatter). This is the agent's system prompt. Preserve the frontmatter unchanged. Read the file back to confirm it parses, then briefly summarize what you changed.

User request: ${description}`;
}
