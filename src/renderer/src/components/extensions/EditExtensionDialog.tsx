// Edit-extension dialog. The user describes a change; the agent edits one file
// (extension.json or guide.md) in a fresh chat, same pipeline as EditSkillDialog.

import { useEffect, useState } from 'react';
import { ArrowUp, Pencil, X } from 'lucide-react';
import { Button, Textarea } from '@/components/ui';
import { displayName, getExtensionsReferenceDocPath } from '@/lib/extensions';
import type { LoadedExtension } from '@/lib/electron';
import type { SeedSubmit } from '@/App';

export type EditExtensionMode = 'config' | 'guide';

const COPY: Record<
  EditExtensionMode,
  { title: string; subtitle: string; placeholder: string; intentTag: string; file: string }
> = {
  config: {
    title: 'Edit configuration',
    subtitle:
      'Describe the change — the agent will update extension.json and leave the guide alone.',
    placeholder: 'Block the delete tool, or add a field for my workspace URL',
    intentTag: 'edit-extension-metadata',
    file: 'extension.json',
  },
  guide: {
    title: 'Edit guide',
    subtitle: 'Describe the change — the agent will rewrite guide.md and leave the config alone.',
    placeholder: 'Add a section on which project to use by default',
    intentTag: 'edit-extension-instructions',
    file: 'guide.md',
  },
};

const PROJECT_EXTENSION_DIR = /[\\/]\.minimalist-agent[\\/]extensions[\\/][^\\/]+$/;

export function EditExtensionDialog({
  mode,
  extension,
  onClose,
  onSubmit,
}: {
  mode: EditExtensionMode;
  extension: LoadedExtension;
  onClose: () => void;
  onSubmit: (submit: SeedSubmit) => void;
}) {
  const [description, setDescription] = useState('');
  const [refDocPath, setRefDocPath] = useState<string | null>(null);
  const copy = COPY[mode];

  useEffect(() => {
    void getExtensionsReferenceDocPath().then(setRefDocPath);
  }, []);

  const canSubmit = description.trim().length > 0 && !!refDocPath;

  const handleSubmit = () => {
    if (!canSubmit || !refDocPath) return;
    const request = description.trim();
    onSubmit({
      displayText: request,
      agentText: buildEditPrompt(mode, request, extension, refDocPath),
      intentTag: copy.intentTag,
      permissionMode: 'auto',
      ...(extension.scope === 'project'
        ? { workingDirectory: extension.path.replace(PROJECT_EXTENSION_DIR, '') }
        : {}),
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
            {copy.title} · {displayName(extension)}
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

        <div className="space-y-3 px-4 py-4">
          <div>
            <h3 className="text-base font-medium text-fg">What would you like to change?</h3>
            <p className="mt-0.5 text-xs text-fg-subtle">{copy.subtitle}</p>
          </div>
          <Textarea
            autoFocus
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={copy.placeholder}
            rows={4}
          />
          <p className="truncate font-mono text-[11px] text-fg-subtle">
            → {extension.path}/{copy.file}
          </p>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-border/60 bg-elevated/30 px-4 py-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!canSubmit}
            iconRight={ArrowUp}
            onClick={handleSubmit}
          >
            Apply
          </Button>
        </footer>
      </div>
    </div>
  );
}

function buildEditPrompt(
  mode: EditExtensionMode,
  request: string,
  extension: LoadedExtension,
  refDocPath: string,
): string {
  const target = `${extension.path}/${COPY[mode].file}`;
  const tag = mode === 'config' ? 'extension_edit_config' : 'extension_edit_guide';
  const instruction =
    mode === 'config'
      ? `edit ONLY \`<target_file>\` (extension.json) per the user's request and leave guide.md alone. Keep the slug unchanged. Follow the reference doc's rules: credentials are \`secret\` refs, per-user values are \`input\` refs with a \`setup.fields\` label, and there are no placeholders and no hand-editing for the user. If you add or rename setup fields, or change the MCP command or secret names, say so — the user must then revisit the extension's Setup section (and Allow again if the command changed).`
      : `edit ONLY the markdown body of \`<target_file>\` (guide.md), preserving its YAML frontmatter, and leave extension.json alone.`;

  return `<${tag}>
<reference_doc>${refDocPath}</reference_doc>
<target_file>${target}</target_file>
<slug>${extension.slug}</slug>
</${tag}>

Read the reference doc at \`<reference_doc>\` first. Then ${instruction} Read the file back to confirm it is still valid, then briefly summarize what you changed.

User request: ${request}`;
}
