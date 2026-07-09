// "+ New Extension" dialog. The user describes what integration they want and
// picks a slug; we hand the agent a scaffold prompt that tells it to research
// the integration, write extension.json + guide.md, and validate.

import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Plug, X } from 'lucide-react';
import {
  getExtensionsDir,
  getExtensionsReferenceDocPath,
} from '@/lib/extensions';
import { useExtensions } from '@/hooks/useExtensions';

// Kick off path resolution at module load — the IPC round-trips are slow
// on first call, so prefetching means the dialog can submit instantly
// the moment the user finishes typing.
void getExtensionsDir();
void getExtensionsReferenceDocPath();
import { cn } from '@/lib/utils';
import type { SeedSubmit } from '@/App';

const PLACEHOLDERS = [
  'Connect to my Linear workspace',
  'Add a vercel CLI extension with my prod token',
  'Set up an aws extension scoped to staging',
  'Wrap our internal "deploy" CLI with a guide',
  'Add the Notion MCP server',
];

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,29}$/;

export function AddExtensionDialog({
  open,
  onClose,
  onSubmit,
  projectDir,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (submit: SeedSubmit) => void;
  /** When set, creates in this dir instead of the user-tier extensions dir. */
  projectDir?: string;
}) {
  const existingExtensions = useExtensions();
  const takenSlugs = new Set(
    (existingExtensions ?? []).map((e) => e.slug.toLowerCase()),
  );

  const [description, setDescription] = useState('');
  const [slug, setSlug] = useState('');
  const [extDir, setExtDir] = useState<string | null>(null);
  const [refDocPath, setRefDocPath] = useState<string | null>(null);
  // Pick a placeholder once when the dialog opens; do NOT recompute on
  // re-renders or the text reshuffles whenever the user moves the mouse.
  const [placeholder, setPlaceholder] = useState(PLACEHOLDERS[0]);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setDescription('');
    setSlug('');
    setPlaceholder(
      PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)],
    );
    void (projectDir ? Promise.resolve(projectDir) : getExtensionsDir()).then(setExtDir);
    void getExtensionsReferenceDocPath().then(setRefDocPath);
    requestAnimationFrame(() => taRef.current?.focus());
  }, [open]);

  if (!open) return null;

  const slugTaken =
    slug.length > 0 && SLUG_RE.test(slug) && takenSlugs.has(slug.toLowerCase());
  const slugError =
    slug.length > 0 && !SLUG_RE.test(slug)
      ? 'Lowercase, hyphenated, ≤30 chars (e.g. `linear`).'
      : slugTaken
        ? `An extension with slug "${slug}" already exists. Pick a different slug or delete the existing one first.`
        : null;
  const canSubmit =
    description.trim().length > 0 &&
    (slug.length === 0 || (SLUG_RE.test(slug) && !slugTaken)) &&
    !!extDir &&
    !!refDocPath;

  const handleSubmit = () => {
    if (!canSubmit || !extDir || !refDocPath) return;
    const desc = description.trim();
    onSubmit({
      displayText: desc,
      agentText: buildScaffoldPrompt(desc, slug, extDir, refDocPath),
      intentTag: 'add-extension',
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
          <Plug className="h-4 w-4 text-accent" strokeWidth={1.75} />
          <h2 className="flex-1 text-sm font-medium text-fg">New Extension</h2>
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
            What should the agent be able to do?
          </h3>
          <p className="mt-0.5 text-xs text-fg-subtle">
            Describe the integration. The agent will research it, write the
            config + guide, and verify it loads.
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
              → {extDir ? `${extDir}/${slug}/` : '…'}
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
            Build extension <ArrowUp className="h-3.5 w-3.5" strokeWidth={2.5} />
          </button>
        </footer>
      </div>
    </div>
  );
}

function buildScaffoldPrompt(
  description: string,
  slug: string,
  extensionsDir: string,
  refDocPath: string,
): string {
  const slugInstructions = slug
    ? `Once decided, create both \`${extensionsDir}/${slug}/extension.json\` and \`${extensionsDir}/${slug}/guide.md\` exactly at the slug above. Do NOT change the slug or location.`
    : `Choose an appropriate slug (lowercase, hyphenated, ≤30 chars — e.g. \`linear\`) that clearly reflects the integration, then create both \`${extensionsDir}/<chosen-slug>/extension.json\` and \`${extensionsDir}/<chosen-slug>/guide.md\` at that location.`;
  return `<extension_create>
<reference_doc>${refDocPath}</reference_doc>
<extensions_dir>${extensionsDir}</extensions_dir>
${slug ? `<slug>${slug}</slug>` : ''}
</extension_create>

Read the reference doc at \`<reference_doc>\` first — it covers extension.json schema, guide.md format, the three variants (guide-only / cli-bound / mcp-backed), and examples.

Then:
1. If this involves a third-party service (e.g. Linear, Notion, AWS), use WebSearch to find the current docs / MCP package / CLI before deciding the variant. Cite sources in extension.json.provenance.
2. Choose the variant that actually fits the service:
   - **guide-only** when the agent only needs prose nudging (an internal SOP, a coding-style note, an existing CLI that's already configured).
   - **cli-bound** when there's a well-maintained CLI for the service (\`gh\`, \`aws\`, \`vercel\`) and you'd just be calling it.
   - **mcp-backed** when the service ships a real MCP server, OR has no good CLI and you want structured tool calls (Linear, Notion).
   Don't bias toward simplicity for its own sake — pick what fits.
3. **If two variants are both reasonable and the trade-off is non-trivial** (e.g. an official MCP server exists *and* the CLI works fine, or the user's intent is ambiguous), pause and ask the user which to use before writing files. Frame it as a short choice with a one-line reason for each.
4. ${slugInstructions}
5. After writing, validate by reading both files back.
6. Briefly summarize what you built and what (if anything) the user needs to do next (e.g. provide an API key).

User wants an extension that will: ${description}`;
}
