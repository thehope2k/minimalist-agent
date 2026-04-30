// Renderer-side attachment helpers: classify, paste-from-clipboard, drop-list
// → DraftAttachment, plus thin wrappers around the IPC bridge.

import type { DraftAttachment, StoredAttachment } from './electron';

export const REJECTED_EXTS = new Set([
  '.docx', '.xlsx', '.pptx', '.doc', '.xls', '.ppt',
]);

const IMAGE_MIME_PREFIX = 'image/';

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i).toLowerCase();
}

/** Read a File (drag-drop or <input type="file">) into a DraftAttachment. */
export async function fileToDraft(file: File): Promise<DraftAttachment> {
  const ext = extOf(file.name);
  if (REJECTED_EXTS.has(ext)) {
    throw new Error(`Office files (${ext}) aren't supported in this build.`);
  }
  if (file.size > 20 * 1024 * 1024) {
    throw new Error(
      `File too large: ${file.name} (${Math.round(file.size / 1024 / 1024)}MB > 20MB).`,
    );
  }

  const isImage = file.type.startsWith(IMAGE_MIME_PREFIX);
  const isPdf = file.type === 'application/pdf' || ext === '.pdf';

  if (isImage || isPdf) {
    const base64 = await fileToBase64(file);
    return {
      type: isImage ? 'image' : 'pdf',
      path: 'clipboard',
      name: file.name || (isImage ? 'pasted-image.png' : 'document.pdf'),
      mimeType: file.type || (isImage ? 'image/png' : 'application/pdf'),
      size: file.size,
      base64,
    };
  }

  // text-ish — read as utf-8 (we'll trust the user; binary garbage is on them).
  const text = await file.text();
  return {
    type: 'text',
    path: file.name,
    name: file.name,
    mimeType: file.type || 'text/plain',
    size: file.size,
    text: text.slice(0, 100 * 1024),
  };
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') return reject(new Error('Read failed'));
      // result is a data URL: "data:<mime>;base64,<...>"
      const idx = result.indexOf('base64,');
      resolve(idx === -1 ? '' : result.slice(idx + 'base64,'.length));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Read failed'));
    reader.readAsDataURL(file);
  });
}

/* -------- IPC wrappers -------- */

export async function pickAttachments(): Promise<DraftAttachment[]> {
  return (await window.api.attachments.pickFiles()) as DraftAttachment[];
}

export async function readAttachmentPath(path: string): Promise<DraftAttachment | null> {
  return (await window.api.attachments.readPath(path)) as DraftAttachment | null;
}

export async function storeAttachment(
  sessionId: string,
  draft: DraftAttachment,
): Promise<StoredAttachment> {
  return (await window.api.attachments.store(sessionId, draft)) as StoredAttachment;
}

export async function readAttachmentBase64(storedPath: string): Promise<string | null> {
  return window.api.attachments.readAsBase64(storedPath);
}

export function revealAttachment(storedPath: string): Promise<void> {
  return window.api.attachments.reveal(storedPath);
}
