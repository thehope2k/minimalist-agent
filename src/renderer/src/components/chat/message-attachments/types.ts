import type { StoredAttachment } from '@/lib/electron';

export interface MessageAttachmentsProps {
  attachments: StoredAttachment[];
  className?: string;
}

export type CopyState = 'idle' | 'copied' | 'error';
