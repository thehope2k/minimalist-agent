import { File as FileIcon, FileCode, FileText } from 'lucide-react';
import { readAttachmentBase64 } from '@/lib/attachments';
import type { StoredAttachment } from '@/lib/electron';

/** Copy a single image attachment to the clipboard as `image/<mime>`. */
export async function copyImageToClipboard(att: StoredAttachment): Promise<void> {
  const b64 = await readAttachmentBase64(att.storedPath);
  if (!b64) throw new Error('Image data unavailable');
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  const blob = new Blob([arr], { type: att.mimeType || 'image/png' });
  await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
}

export function FileBadgeIcon({ att }: { att: StoredAttachment }) {
  if (att.type === 'pdf') {
    return <FileText className="h-3.5 w-3.5 text-fg-muted" strokeWidth={1.75} />;
  }
  if (
    att.mimeType.startsWith('text/') ||
    /\.(ts|tsx|js|jsx|py|go|rs|cpp|c|h|java|json|ya?ml|html|css|scss|md)$/i.test(
      att.name,
    )
  ) {
    return <FileCode className="h-3.5 w-3.5 text-fg-muted" strokeWidth={1.75} />;
  }
  return <FileIcon className="h-3.5 w-3.5 text-fg-muted" strokeWidth={1.75} />;
}

export function labelFor(att: StoredAttachment): string {
  if (att.type === 'pdf') return 'PDF';
  const ext = att.name.split('.').pop();
  return ext ? ext.toUpperCase() : 'FILE';
}
