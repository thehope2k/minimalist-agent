import { useRef, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { File as FileIcon, FileCode, FileText, Image as ImageIcon, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { languageLabel } from '@/lib/language-detect';
import type { DraftAttachment } from '@/lib/electron';
import { ExpandModal } from '@/components/ui';
import { SnippetEditModal } from './SnippetEditModal';

type Props = {
  attachments: DraftAttachment[];
  onRemove: (index: number) => void;
  onUpdate?: (index: number, updated: DraftAttachment) => void;
  /** Show this many spinner-bubbles after the existing items. */
  loadingCount?: number;
  disabled?: boolean;
  /**
   * When false, image attachments are rendered struck-through/dimmed to
   * signal they won't be sent to the active (non-vision) model.
   */
  supportsVision?: boolean;
};

/**
 * ChatGPT-style strip of attachment chips, sits above the textarea.
 *  - 56×56px image thumbnails.
 *  - File chips with icon + 2-line filename + type label for non-images.
 *  - X button on hover.
 */
export function AttachmentPreview({
  attachments,
  onRemove,
  onUpdate,
  loadingCount = 0,
  disabled,
  supportsVision = true,
}: Props) {
  if (attachments.length === 0 && loadingCount === 0) return null;
  return (
    <div className="scroll-thin flex gap-2 overflow-x-auto border-b border-border/50 px-3 py-2.5">
      {attachments.map((att, i) => (
        att.type === 'snippet' ? (
          <SnippetBubble
            key={`${att.path}-${i}`}
            att={att}
            onRemove={() => onRemove(i)}
            onUpdate={onUpdate ? (updated) => onUpdate(i, updated) : undefined}
            disabled={disabled}
          />
        ) : (
          <Bubble
            key={`${att.path}-${i}`}
            att={att}
            onRemove={() => onRemove(i)}
            disabled={disabled}
            excluded={att.type === 'image' && !supportsVision}
          />
        )
      ))}
      {Array.from({ length: loadingCount }, (_, i) => (
        <LoadingBubble key={`loading-${i}`} />
      ))}
    </div>
  );
}

function LoadingBubble() {
  return (
    <div className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-elevated">
      <Loader2 className="h-4 w-4 animate-spin text-fg-subtle" strokeWidth={1.75} />
    </div>
  );
}

function Bubble({
  att,
  onRemove,
  disabled,
  excluded,
}: {
  att: DraftAttachment;
  onRemove: () => void;
  disabled?: boolean;
  /** Image won't be sent to the active model (no vision support). */
  excluded?: boolean;
}) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const isImage = att.type === 'image';
  const src = isImage && att.base64 ? `data:${att.mimeType};base64,${att.base64}` : null;

  return (
    <div className="group relative shrink-0 select-none">
      {!disabled && (
        <button
          onClick={onRemove}
          aria-label={`Remove ${att.name}`}
          className={cn(
            'absolute -right-1.5 -top-1.5 z-10 grid h-5 w-5 place-items-center rounded-full',
            'bg-fg/80 text-app opacity-0 transition-opacity group-hover:opacity-100 hover:bg-fg',
          )}
        >
          <X className="h-3 w-3" strokeWidth={2.25} />
        </button>
      )}

      {isImage ? (
        <>
          <div
            title={
              excluded
                ? "This model doesn't support images \u2014 won't be sent"
                : att.name
            }
            className={cn(
              'relative h-14 w-14 overflow-hidden rounded-lg bg-elevated',
              src && 'cursor-zoom-in',
              excluded && 'opacity-40 grayscale',
            )}
            onClick={() => src && setLightboxOpen(true)}
          >
            {src ? (
              <img src={src} alt={att.name} className="h-full w-full object-cover" />
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
          {lightboxOpen && src && (
            <ExpandModal title={att.name} onClose={() => setLightboxOpen(false)}>
              <div className="scroll-thin flex-1 overflow-auto p-4">
                <img
                  src={src}
                  alt={att.name}
                  className="mx-auto block max-w-full rounded"
                />
              </div>
            </ExpandModal>
          )}
        </>
      ) : (
        <div className="flex h-14 items-center gap-2.5 rounded-lg bg-elevated px-2 pr-3">
          <div className="grid h-10 w-8 shrink-0 place-items-center rounded-md bg-panel">
            <FileBadgeIcon att={att} />
          </div>
          <div className="flex max-w-[140px] min-w-0 flex-col">
            <span className="line-clamp-2 break-all text-xs font-medium text-fg" title={att.name}>
              {att.name}
            </span>
            <span className="text-[10px] text-fg-subtle">{labelFor(att)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function FileBadgeIcon({ att }: { att: DraftAttachment }) {
  if (att.type === 'pdf') {
    return <FileText className="h-4 w-4 text-fg-muted" strokeWidth={1.75} />;
  }
  if (att.mimeType.startsWith('text/') || /\.(ts|tsx|js|jsx|py|go|rs|cpp|c|h|java|json|ya?ml|html|css|scss|md)$/i.test(att.name)) {
    return <FileCode className="h-4 w-4 text-fg-muted" strokeWidth={1.75} />;
  }
  return <FileIcon className="h-4 w-4 text-fg-muted" strokeWidth={1.75} />;
}

function labelFor(att: DraftAttachment): string {
  if (att.type === 'pdf') return 'PDF';
  if (att.mimeType.startsWith('image/')) return att.mimeType.split('/')[1].toUpperCase();
  const ext = att.name.split('.').pop();
  return ext ? ext.toUpperCase() : 'FILE';
}

// ---------- Snippet bubble with hover preview ----------

function SnippetBubble({
  att,
  onRemove,
  onUpdate,
  disabled,
}: {
  att: DraftAttachment;
  onRemove: () => void;
  onUpdate?: (updated: DraftAttachment) => void;
  disabled?: boolean;
}) {
  const [hoverOpen, setHoverOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleClose = () => {
    closeTimer.current = setTimeout(() => setHoverOpen(false), 80);
  };
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  };

  const preview = (att.text ?? '').split('\n').slice(0, 6).join('\n');
  const lang = att.language ?? 'plaintext';
  const badge = languageLabel(lang);
  const lines = att.lineCount ?? (att.text ?? '').split('\n').length;

  return (
    <>
      <Popover.Root open={hoverOpen} onOpenChange={setHoverOpen}>
        <div className="group relative shrink-0 select-none">
          {!disabled && (
            <button
              onClick={onRemove}
              aria-label={`Remove ${att.name}`}
              className={cn(
                'absolute -right-1.5 -top-1.5 z-10 grid h-5 w-5 place-items-center rounded-full',
                'bg-fg/80 text-app opacity-0 transition-opacity group-hover:opacity-100 hover:bg-fg',
              )}
            >
              <X className="h-3 w-3" strokeWidth={2.25} />
            </button>
          )}

          <Popover.Trigger asChild>
            <div
              onMouseEnter={() => { cancelClose(); setHoverOpen(true); }}
              onMouseLeave={scheduleClose}
              onClick={() => { setHoverOpen(false); setEditing(true); }}
              className="flex h-16 min-w-[140px] max-w-[200px] cursor-pointer items-center gap-2.5 rounded-lg bg-elevated px-2 pr-3 transition-colors hover:bg-elevated-2"
            >
              <div className="grid h-10 w-8 shrink-0 place-items-center rounded-md bg-panel">
                <FileCode className="h-4 w-4 text-accent" strokeWidth={1.75} />
              </div>
              <div className="flex min-w-0 flex-col">
                <span
                  className="line-clamp-1 break-all text-xs font-medium text-fg"
                  title={att.name}
                >
                  {att.name}
                </span>
                <span className="text-[10px] text-fg-subtle">
                  {badge} · {lines} line{lines !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          </Popover.Trigger>
        </div>

        <Popover.Portal>
          <Popover.Content
            side="top"
            align="start"
            sideOffset={6}
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            className={cn(
              'z-50 max-w-[280px] rounded-lg border border-border bg-panel p-2.5 shadow-lg',
              'animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out',
              'data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
            )}
          >
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
              {att.name} · click to edit
            </p>
            <pre className="max-h-40 overflow-hidden text-[11px] leading-relaxed text-fg-muted whitespace-pre-wrap break-all">
              {preview}
            </pre>
            {lines > 6 && (
              <p className="mt-1 text-[10px] text-fg-subtle">…{lines - 6} more lines</p>
            )}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      {editing && (
        <SnippetEditModal
          attachment={att}
          onSave={(updated) => { onUpdate?.(updated); setEditing(false); }}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  );
}
