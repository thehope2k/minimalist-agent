// Image processing for attachments: validation, resize for the Anthropic API,
// thumbnail generation. Backed by sharp.

import sharp from 'sharp';

/** Anthropic Vision API limits. */
export const IMAGE_LIMITS = {
  /** Hard max bytes for a single image. */
  MAX_SIZE: 5 * 1024 * 1024,
  /** Hard max edge length in pixels. */
  MAX_DIMENSION: 8000,
  /** Recommended max edge for cost / latency balance. */
  OPTIMAL_EDGE: 1568,
  JPEG_QUALITY_HIGH: 90,
  JPEG_QUALITY_FALLBACK: 75,
} as const;

export interface ImageInspection {
  width: number;
  height: number;
  format?: string;
}

/** Read width / height / format from an in-memory image buffer. */
export async function inspectImage(buffer: Buffer): Promise<ImageInspection | null> {
  try {
    const meta = await sharp(buffer).metadata();
    if (!meta.width || !meta.height) return null;
    return { width: meta.width, height: meta.height, format: meta.format };
  } catch {
    return null;
  }
}

export interface ResizeResult {
  buffer: Buffer;
  width: number;
  height: number;
  format: 'png' | 'jpeg';
}

/**
 * Resize/compress an image so it fits Anthropic's per-image limits.
 *
 * Strategy:
 *   1. If max edge > OPTIMAL_EDGE (1568px), scale down.
 *   2. Encode as PNG (or JPEG when isPhoto).
 *   3. If still over MAX_SIZE, retry as JPEG @ q90, then q75.
 *   4. Return null if even q75 can't fit.
 */
export async function resizeImageForAPI(
  buffer: Buffer,
  options?: { maxSizeBytes?: number; isPhoto?: boolean },
): Promise<ResizeResult | null> {
  const maxSize = options?.maxSizeBytes ?? IMAGE_LIMITS.MAX_SIZE;
  const isPhoto = options?.isPhoto ?? false;

  const meta = await inspectImage(buffer);
  if (!meta) return null;

  let outW = meta.width;
  let outH = meta.height;
  const maxEdge = Math.max(outW, outH);
  if (maxEdge > IMAGE_LIMITS.OPTIMAL_EDGE) {
    const scale = IMAGE_LIMITS.OPTIMAL_EDGE / maxEdge;
    outW = Math.round(outW * scale);
    outH = Math.round(outH * scale);
  }
  if (outW > IMAGE_LIMITS.MAX_DIMENSION || outH > IMAGE_LIMITS.MAX_DIMENSION) {
    const scale = Math.min(
      IMAGE_LIMITS.MAX_DIMENSION / outW,
      IMAGE_LIMITS.MAX_DIMENSION / outH,
    );
    outW = Math.floor(outW * scale);
    outH = Math.floor(outH * scale);
  }
  const needsResize = outW !== meta.width || outH !== meta.height;

  let format: 'png' | 'jpeg' = isPhoto ? 'jpeg' : 'png';
  let pipeline = sharp(buffer);
  if (needsResize) pipeline = pipeline.resize(outW, outH, { fit: 'inside' });
  let out = isPhoto
    ? await pipeline.jpeg({ quality: IMAGE_LIMITS.JPEG_QUALITY_HIGH }).toBuffer()
    : await pipeline.png().toBuffer();

  if (out.length > maxSize) {
    format = 'jpeg';
    out = await sharp(buffer)
      .resize(outW, outH, { fit: 'inside' })
      .jpeg({ quality: IMAGE_LIMITS.JPEG_QUALITY_HIGH })
      .toBuffer();
  }
  if (out.length > maxSize) {
    out = await sharp(buffer)
      .resize(outW, outH, { fit: 'inside' })
      .jpeg({ quality: IMAGE_LIMITS.JPEG_QUALITY_FALLBACK })
      .toBuffer();
  }
  if (out.length > maxSize) return null;

  return { buffer: out, width: outW, height: outH, format };
}

/** Generate a 200×200 PNG thumbnail (object-fit cover). Returns base64. */
export async function generateImageThumbnail(buffer: Buffer): Promise<string | null> {
  try {
    const out = await sharp(buffer)
      .resize(200, 200, { fit: 'cover' })
      .png()
      .toBuffer();
    return out.toString('base64');
  } catch {
    return null;
  }
}
