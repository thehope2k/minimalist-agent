import { cn } from '@/lib/utils';
import { AttachmentChip } from './message-attachments/AttachmentChip';
import { SnippetChip } from './message-attachments/SnippetChip';
import { ImageThumbnail } from './message-attachments/ImageThumbnail';
import type { MessageAttachmentsProps } from './message-attachments/types';
import type { StoredAttachment } from '@/lib/electron';

/**
 * Inline attachment strip displayed inside a user-message bubble.
 * Routes to ImageThumbnail, SnippetChip, or AttachmentChip based on type.
 */
export function MessageAttachments({ attachments, className }: MessageAttachmentsProps) {
  return (
    <div className={cn('flex flex-wrap items-end gap-2', className)}>
      {attachments.map((att, i) => (
        <AttachmentItem key={`${att.storedPath}-${i}`} att={att} />
      ))}
    </div>
  );
}

function AttachmentItem({ att }: { att: StoredAttachment }) {
  if (att.type === 'image') return <ImageThumbnail att={att} />;
  if (att.type === 'snippet') return <SnippetChip att={att} />;
  return <AttachmentChip att={att} />;
}
