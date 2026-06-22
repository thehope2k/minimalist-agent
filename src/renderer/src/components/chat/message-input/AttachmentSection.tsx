import { AttachmentPreview } from '../AttachmentPreview';
import type { DraftAttachment } from '@/lib/electron';

type Props = {
  attachments: DraftAttachment[];
  loadingCount: number;
  isStreaming: boolean;
  supportsVision: boolean;
  onRemove: (index: number) => void;
  onUpdate: (index: number, updated: DraftAttachment) => void;
};

export function AttachmentSection({
  attachments,
  loadingCount,
  isStreaming,
  supportsVision,
  onRemove,
  onUpdate,
}: Props) {
  if (attachments.length === 0 && loadingCount === 0) return null;
  
  return (
    <AttachmentPreview
      attachments={attachments}
      onRemove={onRemove}
      onUpdate={onUpdate}
      loadingCount={loadingCount}
      disabled={isStreaming}
      supportsVision={supportsVision}
    />
  );
}
