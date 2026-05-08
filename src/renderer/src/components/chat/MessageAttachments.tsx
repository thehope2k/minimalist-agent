import { useEffect, useState } from 'react';
import { File as FileIcon, FileCode, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { readAttachmentBase64, revealAttachment } from '@/lib/attachments';
import { languageLabel } from '@/lib/language-detect';
import type { StoredAttachment } from '@/lib/electron';

/** Copy a single image attachment to the clipboard as `image/<mime>`. */
async function copyImageToClipboard(att: StoredAttachment): Promise<void> {
  const b64 = await readAttachmentBase64(att.storedPath);
  if (!b64) throw new Error('Image data unavailable');
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  const blob = new Blob([arr], { type: att.mimeType || 'image/png' });
  await navigator.clipboard.write([
    new ClipboardItem({ [blob.type]: blob }),
  ]);
}

type Props = {
  attachments: StoredAttachment[];
  className?: string;
};

/**
 * Inline attachment strip displayed inside a user-message bubble. Images
 * are shown as 88×88 thumbnails (click → reveal in OS file manager).
 * Non-image files render as a chip with a type label.
 */
export function MessageAttachments({ attachments, className }: Props) {
  return (
    <div className={cn('flex flex-wrap items-end gap-2', className)}>
      {attachments.map((att, i) => (
        <Item key={`${att.storedPath}-${i}`} att={att} />
      ))}
    </div>
  );
}

function Item({ att }: { att: StoredAttachment }) {
  if (att.type === 'image') return <ImageItem att={att} />;
  if (att.type === 'snippet') return <SnippetItem att={att} />;
  return (
    <button
      onClick={() => void revealAttachment(att.storedPath)}
      title={att.storedPath}
      className="flex max-w-[260px] items-center gap-2.5 rounded-lg bg-elevated px-2.5 py-2 text-left transition-colors hover:bg-elevated-2"
    >
      <div className="grid h-9 w-7 shrink-0 place-items-center rounded-md bg-panel">
        <FileBadgeIcon att={att} />
      </div>
      <div className="flex min-w-0 flex-col">
        <span className="line-clamp-1 break-all text-xs font-medium text-fg">
          {att.name}
        </span>
        <span className="text-[10px] text-fg-subtle">{labelFor(att)}</span>
      </div>
    </button>
  );
}

function SnippetItem({ att }: { att: StoredAttachment }) {
  const [text, setText] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  // Lazy-load content only when the preview is first opened.
  useEffect(() => {
    if (!open || text !== null) return;
    let alive = true;
    void readAttachmentBase64(att.storedPath).then((b64) => {
      if (alive && b64) setText(atob(b64));
    });
    return () => { alive = false; };
  }, [open, text, att.storedPath]);

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

function SnippetPreviewModal({
  name,
  language,
  text,
  onClose,
}: {
  name: string;
  language: string;
  text: string | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={name}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-8"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-panel shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <span className="text-sm font-medium text-fg">{name}</span>
          <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent">
            {languageLabel(language)}
          </span>
        </div>
        <div className="scroll-thin flex-1 overflow-auto">
          {text === null ? (
            <p className="p-4 text-xs text-fg-subtle">Loading…</p>
          ) : (
            <pre className="p-4 text-xs leading-relaxed text-fg-muted whitespace-pre-wrap break-all">
              {text}
            </pre>
          )}
        </div>
        <div className="border-t border-border px-4 py-2 text-right">
          <button
            onClick={onClose}
            className="text-xs text-fg-subtle transition-colors hover:text-fg-muted"
          >
            Close · Esc
          </button>
        </div>
      </div>
    </div>
  );
}

function ImageItem({ att }: { att: StoredAttachment }) {
  // Prefer the persisted thumbnail/resized base64. If neither survived (older
  // sessions), fall back to reading bytes off disk on mount.
  const [src, setSrc] = useState<string | null>(() => {
    if (att.thumbnailBase64) return `data:image/png;base64,${att.thumbnailBase64}`;
    if (att.resizedBase64) return `data:${att.mimeType};base64,${att.resizedBase64}`;
    return null;
  });
  const [fullSrc, setFullSrc] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>(
    'idle',
  );
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (src) return;
    let alive = true;
    void readAttachmentBase64(att.storedPath).then((b64) => {
      if (alive && b64) setSrc(`data:${att.mimeType};base64,${b64}`);
    });
    return () => {
      alive = false;
    };
  }, [src, att.storedPath, att.mimeType]);

  // The thumbnail can be a tiny resized PNG; the lightbox wants the
  // original bytes. Fetch on first open and cache thereafter.
  useEffect(() => {
    if (!open || fullSrc) return;
    let alive = true;
    void readAttachmentBase64(att.storedPath).then((b64) => {
      if (alive && b64) setFullSrc(`data:${att.mimeType};base64,${b64}`);
    });
    return () => {
      alive = false;
    };
  }, [open, fullSrc, att.storedPath, att.mimeType]);

  const handleContextMenu = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      await copyImageToClipboard(att);
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
    window.setTimeout(() => setCopyState('idle'), 1500);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        onContextMenu={(e) => void handleContextMenu(e)}
        title={`${att.name}\nClick to view · Right-click to copy image`}
        className="relative h-22 w-22 overflow-hidden rounded-lg bg-elevated transition-opacity hover:opacity-90"
        style={{ height: 88, width: 88 }}
      >
        {src ? (
          <img src={src} alt={att.name} className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center text-xs text-fg-subtle">
            …
          </div>
        )}
        {copyState !== 'idle' && (
          <div
            className={cn(
              'absolute inset-0 grid place-items-center text-[10px] font-semibold uppercase tracking-wide',
              copyState === 'copied'
                ? 'bg-black/65 text-emerald-300'
                : 'bg-black/65 text-red-300',
            )}
          >
            {copyState === 'copied' ? 'Copied' : 'Failed'}
          </div>
        )}
      </button>
      {open && (
        <ImageLightbox
          src={fullSrc ?? src ?? ''}
          name={att.name}
          onClose={() => setOpen(false)}
          onReveal={() => void revealAttachment(att.storedPath)}
        />
      )}
    </>
  );
}

function ImageLightbox({
  src,
  name,
  onClose,
  onReveal,
}: {
  src: string;
  name: string;
  onClose: () => void;
  onReveal: () => void;
}) {
  // Esc to close. Mounted at the body level via fixed positioning, so the
  // listener is global for the lifetime of the lightbox.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={name}
      onClick={onClose}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/85 p-8"
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onReveal();
        }}
        className="max-w-full truncate text-xs text-white/70 transition-colors hover:text-white"
        title="Show in Finder"
      >
        {name}
      </button>
      {src ? (
        // Stop click bubbling so clicking the image itself doesn't dismiss.
        <img
          src={src}
          alt={name}
          onClick={(e) => e.stopPropagation()}
          className="max-h-[88vh] max-w-[92vw] rounded-md object-contain shadow-2xl"
        />
      ) : (
        <div className="text-sm text-white/60">Loading…</div>
      )}
      <div className="text-[11px] text-white/40">Press Esc or click outside to close</div>
    </div>
  );
}

function FileBadgeIcon({ att }: { att: StoredAttachment }) {
  if (att.type === 'pdf') {
    return <FileText className="h-3.5 w-3.5 text-fg-muted" strokeWidth={1.75} />;
  }
  if (
    att.mimeType.startsWith('text/') ||
    /\.(ts|tsx|js|jsx|py|go|rs|cpp|c|h|java|json|ya?ml|html|css|scss|md)$/i.test(att.name)
  ) {
    return <FileCode className="h-3.5 w-3.5 text-fg-muted" strokeWidth={1.75} />;
  }
  return <FileIcon className="h-3.5 w-3.5 text-fg-muted" strokeWidth={1.75} />;
}

function labelFor(att: StoredAttachment): string {
  if (att.type === 'pdf') return 'PDF';
  const ext = att.name.split('.').pop();
  return ext ? ext.toUpperCase() : 'FILE';
}
