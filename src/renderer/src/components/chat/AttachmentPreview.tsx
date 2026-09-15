import { Loader2 } from 'lucide-react';
import type { DraftAttachment } from '@/lib/electron';
import { AttachmentChip } from './attachment-preview/AttachmentChip';
import { SnippetAttachmentChip } from './attachment-preview/SnippetAttachmentChip';

type Props = {
  attachments: DraftAttachment[];
  onRemove: (index: number) => void;
  onUpdate?: (index: number, updated: DraftAttachment) => void;
  loadingCount?: number;
  disabled?: boolean;
  supportsVision?: boolean;
};

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
      {attachments.map((attachment, index) => (
        attachment.type === 'snippet' ? (
          <SnippetAttachmentChip
            key={`${attachment.path}-${index}`}
            attachment={attachment}
            onRemove={() => onRemove(index)}
            onUpdate={onUpdate ? (updated) => onUpdate(index, updated) : undefined}
            disabled={disabled}
          />
        ) : (
          <AttachmentChip
            key={`${attachment.path}-${index}`}
            attachment={attachment}
            onRemove={() => onRemove(index)}
            disabled={disabled}
            excluded={attachment.type === 'image' && !supportsVision}
          />
        )
      ))}
      {Array.from({ length: loadingCount }, (_, index) => <LoadingChip key={`loading-${index}`} />)}
    </div>
  );
}

function LoadingChip() {
  return (
    <div className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-elevated">
      <Loader2 className="h-4 w-4 animate-spin text-fg-subtle" strokeWidth={1.75} />
    </div>
  );
}
