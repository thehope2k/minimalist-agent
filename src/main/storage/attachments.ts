// Per-session attachment storage.
//
// Layout:
//   <userData>/sessions/{sessionId}/attachments/{uuid}_{safe-name}
//
// Office files (.docx/.xlsx/...) are intentionally NOT supported here — the
// renderer rejects them before this point.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Paths } from './paths';
import {
  IMAGE_LIMITS,
  generateImageThumbnail,
  inspectImage,
  resizeImageForAPI,
} from './images';
import type { StoredAttachment, AttachmentType } from './sessions';

export interface DraftAttachment {
  type: AttachmentType;
  path: string;
  name: string;
  mimeType: string;
  size: number;
  base64?: string;
  text?: string;
  /** Detected or user-set language tag (snippets only). */
  language?: string;
  /** Pre-computed line count (snippets only). */
  lineCount?: number;
}

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_TEXT_SIZE = 100 * 1024;

const IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
};

const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.json', '.js', '.ts', '.tsx', '.jsx',
  '.py', '.rb', '.go', '.rs', '.java', '.c', '.cpp', '.h',
  '.css', '.scss', '.html', '.xml', '.yaml', '.yml', '.toml',
  '.sh', '.bash', '.zsh', '.fish', '.sql', '.graphql',
  '.env', '.gitignore', '.dockerfile', '.makefile',
  '.csv', '.log', '.conf', '.ini', '.cfg',
]);

/** Office files we explicitly reject (per project scope). */
const REJECTED_EXTENSIONS = new Set([
  '.docx', '.xlsx', '.pptx', '.doc', '.xls', '.ppt',
]);

function classify(name: string): AttachmentType | 'reject' {
  const ext = extname(name).toLowerCase();
  if (REJECTED_EXTENSIONS.has(ext)) return 'reject';
  if (ext in IMAGE_MIME) return 'image';
  if (ext === '.pdf') return 'pdf';
  return 'text';
}

function mimeFor(name: string, type: AttachmentType): string {
  const ext = extname(name).toLowerCase();
  if (type === 'image') return IMAGE_MIME[ext] ?? 'application/octet-stream';
  if (type === 'pdf') return 'application/pdf';
  if (TEXT_EXTENSIONS.has(ext)) return 'text/plain';
  return 'application/octet-stream';
}

function sanitizeFilename(name: string): string {
  // Keep alphanumerics, dots, underscores, hyphens. Replace anything else.
  const cleaned = name.replace(/[^a-zA-Z0-9._-]+/g, '_');
  return cleaned.length > 120 ? cleaned.slice(0, 120) : cleaned || 'file';
}

function attachmentsDir(sessionId: string): string {
  // Defence-in-depth: refuse traversal in session ids.
  if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
    throw new Error(`Invalid session id: ${sessionId}`);
  }
  const dir = join(Paths.sessionsDir(), sessionId, 'attachments');
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Read an absolute path off disk and produce a draft attachment. Used by
 * the file picker, drag-and-drop, and pasted file-URI flows.
 */
export function readPathAsDraft(absPath: string): DraftAttachment | null {
  if (!existsSync(absPath)) return null;
  const fs = require('node:fs') as typeof import('node:fs');
  const stats = fs.statSync(absPath);
  if (!stats.isFile()) return null;
  if (stats.size > MAX_FILE_SIZE) {
    throw new Error(
      `File too large: ${absPath} (${Math.round(stats.size / 1024 / 1024)}MB > 20MB limit)`,
    );
  }

  const name = absPath.split(/[\\/]/).pop() ?? 'file';
  const klass = classify(name);
  if (klass === 'reject') {
    throw new Error(
      `Office files (.docx / .xlsx / .pptx) aren't supported in this build.`,
    );
  }
  const mimeType = mimeFor(name, klass);
  const draft: DraftAttachment = {
    type: klass,
    path: absPath,
    name,
    mimeType,
    size: stats.size,
  };

  if (klass === 'image' || klass === 'pdf') {
    draft.base64 = readFileSync(absPath).toString('base64');
  } else {
    // text — read up to MAX_TEXT_SIZE for in-composer preview only.
    const buf = readFileSync(absPath);
    if (stats.size > MAX_TEXT_SIZE) {
      draft.text =
        buf.toString('utf-8').slice(0, MAX_TEXT_SIZE) +
        `\n\n[Truncated — file is ${Math.round(stats.size / 1024)}KB]`;
    } else {
      draft.text = buf.toString('utf-8');
    }
  }
  return draft;
}

/**
 * Persist a draft into the session attachments dir. For images, we both
 * resize for the API and produce a small thumbnail for chips/inline UI.
 */
export async function storeDraft(
  sessionId: string,
  draft: DraftAttachment,
): Promise<StoredAttachment> {
  if (draft.size === 0) throw new Error('Cannot attach empty file');

  const dir = attachmentsDir(sessionId);
  const safeName = sanitizeFilename(draft.name);
  const storedPath = join(dir, `${randomUUID()}_${safeName}`);

  if (draft.type === 'image') {
    if (!draft.base64) throw new Error('Image attachment missing base64');
    const original = Buffer.from(draft.base64, 'base64');

    // Validate first; if too big or bad image, attempt to resize.
    const inspection = await inspectImage(original);
    if (!inspection) throw new Error('Unrecognized or corrupt image file');
    if (
      original.length > IMAGE_LIMITS.MAX_SIZE ||
      inspection.width > IMAGE_LIMITS.MAX_DIMENSION ||
      inspection.height > IMAGE_LIMITS.MAX_DIMENSION ||
      Math.max(inspection.width, inspection.height) > IMAGE_LIMITS.OPTIMAL_EDGE
    ) {
      const isPhoto = draft.mimeType === 'image/jpeg';
      const resized = await resizeImageForAPI(original, { isPhoto });
      if (!resized) {
        throw new Error(
          'Image is too large even after compression. Try a smaller file.',
        );
      }
      writeFileSync(storedPath, resized.buffer);
      const thumb = await generateImageThumbnail(resized.buffer);
      return {
        type: 'image',
        name: draft.name,
        mimeType: resized.format === 'jpeg' ? 'image/jpeg' : 'image/png',
        size: resized.buffer.length,
        storedPath,
        thumbnailBase64: thumb ?? undefined,
        resizedBase64: resized.buffer.toString('base64'),
      };
    }

    // Already within limits — store as-is.
    writeFileSync(storedPath, original);
    const thumb = await generateImageThumbnail(original);
    return {
      type: 'image',
      name: draft.name,
      mimeType: draft.mimeType,
      size: original.length,
      storedPath,
      thumbnailBase64: thumb ?? undefined,
      resizedBase64: draft.base64,
    };
  }

  if (draft.type === 'pdf') {
    if (!draft.base64) throw new Error('PDF attachment missing base64');
    const buf = Buffer.from(draft.base64, 'base64');
    writeFileSync(storedPath, buf);
    return {
      type: 'pdf',
      name: draft.name,
      mimeType: 'application/pdf',
      size: buf.length,
      storedPath,
    };
  }

  // snippet — same storage as text, but preserves language + lineCount metadata.
  if (draft.type === 'snippet') {
    writeFileSync(storedPath, draft.text ?? '');
    return {
      type: 'snippet',
      name: draft.name,
      mimeType: draft.mimeType,
      size: draft.size,
      storedPath,
      language: draft.language,
      lineCount: draft.lineCount,
    };
  }

  // text — write as utf-8. We don't keep base64 for text.
  writeFileSync(storedPath, draft.text ?? '');
  return {
    type: 'text',
    name: draft.name,
    mimeType: draft.mimeType,
    size: draft.size,
    storedPath,
  };
}

/** Read a stored attachment back as base64 (e.g. on session reload). */
export function readStoredAsBase64(storedPath: string): string | null {
  try {
    if (!existsSync(storedPath)) return null;
    return readFileSync(storedPath).toString('base64');
  } catch {
    return null;
  }
}
