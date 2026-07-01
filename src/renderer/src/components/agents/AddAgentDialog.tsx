// "+ New Agent" dialog. The user provides:
//   - a free-text description of what the agent should do
//   - a slug (name of the directory under ~/.agents/agents/)
//
// Clicking "Build agent" assembles a scaffold prompt and routes it to a
// fresh chat, where the model creates AGENT.md with Write tool.

import { useEffect, useRef, useState } from 'react';
import { X, Sparkles } from 'lucide-react';
import { getAgentsDir } from '@/lib/agents';
import { cn } from '@/lib/utils';
import { Button, Input, Textarea } from '@/components/ui';
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
  const [slugTouched, setSlugTouched] = useState(false);
  const [agentsDir, setAgentsDir] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const [placeholder, setPlaceholder] = useState(PLACEHOLDERS[0]);

  useEffect(() => {
    if (!open) return;
    setDescription('');
    setSlug('');
    setSlugTouched(false);
    setPlaceholder(
      PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)],
    );
    void getAgentsDir().then(setAgentsDir);
    requestAnimationFrame(() => taRef.current?.focus());
  }, [open]);

  // Auto-suggest a slug from the description until the user types one.
  useEffect(() => {
    if (slugTouched) return;
    setSlug(suggestSlug(description));
  }, [description, slugTouched]);

  if (!open) return null;

  const slugError =
    slug.length > 0 && !SLUG_RE.test(slug)
      ? 'Lowercase, hyphenated, ≤30 chars (e.g. `code-reviewer`).'
      : null;
  const canSubmit =
    description.trim().length > 0 &&
    SLUG_RE.test(slug) &&
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

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center bg-black/50 transition-opacity',
        open ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg rounded-lg border border-border bg-panel p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded p-1 hover:bg-elevated"
          aria-label="Close"
        >
          <X className="h-4 w-4 text-fg-muted" strokeWidth={2} />
        </button>

        <h2 className="text-lg font-semibold text-fg">Build a New Agent</h2>
        <p className="mt-1 text-sm text-fg-subtle">
          Describe what the agent should do. The model will create the AGENT.md file.
        </p>

        <div className="mt-4 space-y-3">
          {/* Description */}
          <div>
            <label className="block text-xs font-semibold uppercase text-fg-muted">
              What should this agent do?
            </label>
            <Textarea
              ref={taRef}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={placeholder}
              className="mt-1 text-sm"
              rows={3}
            />
          </div>

          {/* Slug */}
          <div>
            <label className="block text-xs font-semibold uppercase text-fg-muted">
              Agent name (slug)
            </label>
            <Input
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setSlugTouched(true);
              }}
              placeholder="e.g. code-reviewer"
              className="mt-1 font-mono text-sm"
              autoComplete="off"
            />
            {slugError && (
              <p className="mt-1 text-xs text-red-400">{slugError}</p>
            )}
            {slug && !slugError && agentsDir && (
              <p className="mt-1 text-xs text-fg-subtle">
                📁 {agentsDir}/{slug}/AGENT.md
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex gap-2">
          <Button
            variant="ghost"
            onClick={onClose}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!canSubmit}
            onClick={handleSubmit}
            icon={Sparkles}
            className="flex-1"
          >
            Build Agent
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Suggest a slug from free-text description.
 * e.g. "Read-only code analyzer" → "read-only-code-analyzer"
 */
function suggestSlug(description: string): string {
  return description
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove non-alphanumeric except spaces and hyphens
    .trim()
    .replace(/\s+/g, '-') // Spaces to hyphens
    .replace(/-+/g, '-') // Collapse multiple hyphens
    .slice(0, 30) // Max 30 chars
    .replace(/-$/, ''); // Remove trailing hyphen
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
  const target = `${agentsDir}/${slug}/AGENT.md`;
  return `<agent_create>
<target_file>${target}</target_file>
<slug>${slug}</slug>
</agent_create>

Create the file at \`${target}\` with this exact structure:

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
- Slug must match the directory name: \`${slug}\`
- After writing, read the file back to confirm it looks correct, then briefly summarize what you built

User wants an agent that will: ${description}`;
}
