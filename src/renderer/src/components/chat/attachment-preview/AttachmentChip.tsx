import { useState } from 'react';
import { File as FileIcon, FileCode, FileText, Image as ImageIcon, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DraftAttachment } from '@/lib/electron';
import { ExpandModal } from '@/components/ui';

export function AttachmentChip({ attachment, onRemove, disabled, excluded }: {
  attachment: DraftAttachment;
  onRemove: () => void;
  disabled?: boolean;
  excluded?: boolean;
}) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const isImage = attachment.type === 'image';
  const source = isImage && attachment.base64
    ? `data:${attachment.mimeType};base64,${attachment.base64}`
    : null;

  return (
    <div className="group relative shrink-0 select-none">
      {!disabled && <RemoveButton name={attachment.name} onRemove={onRemove} />}
      {isImage ? (
        <>
          <div
            title={excluded ? "This model doesn't support images — won't be sent" : attachment.name}
            className={cn(
              'relative h-14 w-14 overflow-hidden rounded-lg bg-elevated',
              source && 'cursor-zoom-in',
              excluded && 'opacity-40 grayscale',
            )}
            onClick={() => source && setLightboxOpen(true)}
          >
            {source ? (
              <img src={source} alt={attachment.name} className="h-full w-full object-cover" />
            ) : (
              <div className="grid h-full w-full place-items-center">
                <ImageIcon className="h-5 w-5 text-fg-subtle" strokeWidth={1.75} />
              </div>
            )}
            {excluded && (
              <span className="pointer-events-none absolute inset-0 grid place-items-center">
                <span className="h-px w-[120%] rotate-[-30deg] bg-fg/70" />
              </span>
            )}
          </div>
          {lightboxOpen && source && (
            <ExpandModal title={attachment.name} onClose={() => setLightboxOpen(false)}>
              <div className="scroll-thin flex-1 overflow-auto p-4">
                <img src={source} alt={attachment.name} className="mx-auto block max-w-full rounded" />
              </div>
            </ExpandModal>
          )}
        </>
      ) : (
        <div className="flex h-14 items-center gap-2.5 rounded-lg bg-elevated px-2 pr-3">
          <div className="grid h-10 w-8 shrink-0 place-items-center rounded-md bg-panel">
            <FileBadgeIcon attachment={attachment} />
          </div>
          <div className="flex max-w-[140px] min-w-0 flex-col">
            <span className="line-clamp-2 break-all text-xs font-medium text-fg" title={attachment.name}>
              {attachment.name}
            </span>
            <span className="text-[10px] text-fg-subtle">{labelFor(attachment)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function RemoveButton({ name, onRemove }: { name: string; onRemove: () => void }) {
  return (
    <button
      onClick={onRemove}
      aria-label={`Remove ${name}`}
      className={cn(
        'absolute -right-1.5 -top-1.5 z-10 grid h-5 w-5 place-items-center rounded-full',
        'bg-fg/80 text-app opacity-0 transition-opacity group-hover:opacity-100 hover:bg-fg',
      )}
    >
      <X className="h-3 w-3" strokeWidth={2.25} />
    </button>
  );
}

function FileBadgeIcon({ attachment }: { attachment: DraftAttachment }) {
  if (attachment.type === 'pdf') return <FileText className="h-4 w-4 text-fg-muted" strokeWidth={1.75} />;
  if (attachment.mimeType.startsWith('text/') || /\.(ts|tsx|js|jsx|py|go|rs|cpp|c|h|java|json|ya?ml|html|css|scss|md)$/i.test(attachment.name)) {
    return <FileCode className="h-4 w-4 text-fg-muted" strokeWidth={1.75} />;
  }
  return <FileIcon className="h-4 w-4 text-fg-muted" strokeWidth={1.75} />;
}

function labelFor(attachment: DraftAttachment): string {
  if (attachment.type === 'pdf') return 'PDF';
  if (attachment.mimeType.startsWith('image/')) return attachment.mimeType.split('/')[1].toUpperCase();
  const extension = attachment.name.split('.').pop();
  return extension ? extension.toUpperCase() : 'FILE';
}
