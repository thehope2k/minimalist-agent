import { revealAttachment } from '@/lib/attachments';
import type { StoredAttachment } from '@/lib/electron';
import { FileBadgeIcon, labelFor } from './attachment-utils';

interface AttachmentChipProps {
  att: StoredAttachment;
}

/**
 * Generic file attachment chip (non-image, non-snippet).
 */
export function AttachmentChip({ att }: AttachmentChipProps) {
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
