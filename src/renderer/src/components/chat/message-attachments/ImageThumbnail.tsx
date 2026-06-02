import { useState } from 'react';
import { cn } from '@/lib/utils';
import { revealAttachment } from '@/lib/attachments';
import type { StoredAttachment } from '@/lib/electron';
import { ImageLightbox } from './ImageLightbox';
import { useAttachmentImage } from './useAttachmentImage';
import { copyImageToClipboard } from './attachment-utils';
import type { CopyState } from './types';

interface ImageThumbnailProps {
  att: StoredAttachment;
}

/**
 * Image thumbnail with lightbox and copy-on-right-click.
 */
export function ImageThumbnail({ att }: ImageThumbnailProps) {
  const [open, setOpen] = useState(false);
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const { src, fullSrc } = useAttachmentImage(att, open);

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
          <img
            src={src}
            alt={att.name}
            className="h-full w-full object-cover"
          />
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
