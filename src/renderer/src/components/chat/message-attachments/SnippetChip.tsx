import { useState } from 'react';
import { FileCode } from 'lucide-react';
import { languageLabel } from '@/lib/language-detect';
import type { StoredAttachment } from '@/lib/electron';
import { SnippetPreviewModal } from './SnippetPreviewModal';
import { useSnippetPreview } from './useSnippetPreview';

interface SnippetChipProps {
  att: StoredAttachment;
}

/**
 * Code snippet attachment chip with preview modal.
 */
export function SnippetChip({ att }: SnippetChipProps) {
  const [open, setOpen] = useState(false);
  const { text } = useSnippetPreview(open, att.storedPath);

  const badge = languageLabel(att.language ?? 'plaintext');
  const lines = att.lineCount ?? '?';

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={att.storedPath}
        className="flex max-w-[260px] items-center gap-2.5 rounded-lg bg-elevated px-2.5 py-2 text-left transition-colors hover:bg-elevated-2"
      >
        <div className="grid h-9 w-7 shrink-0 place-items-center rounded-md bg-panel">
          <FileCode className="h-3.5 w-3.5 text-accent" strokeWidth={1.75} />
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="line-clamp-1 break-all text-xs font-medium text-fg">
            {att.name}
          </span>
          <span className="text-[10px] text-fg-subtle">
            {badge} · {lines} line{lines !== 1 ? 's' : ''}
          </span>
        </div>
      </button>

      {open && (
        <SnippetPreviewModal
          name={att.name}
          language={att.language ?? 'plaintext'}
          text={text}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
