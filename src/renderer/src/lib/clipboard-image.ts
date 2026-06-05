/**
 * Copy any image (data URL, blob URL, or remote src) to the clipboard as PNG.
 *
 * We re-encode through a canvas rather than writing the source bytes directly
 * because the async clipboard API only reliably accepts `image/png` — jpeg,
 * gif, webp, and svg blobs are rejected by Chromium. Drawing to a canvas
 * normalises every format to PNG and works for raster images and SVGs alike.
 */
export async function copyImageSrcToClipboard(src: string): Promise<void> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });

  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  if (!width || !height) throw new Error('Image has no intrinsic size');

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context unavailable');
  ctx.drawImage(img, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/png'),
  );
  if (!blob) throw new Error('Failed to encode image');

  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}
