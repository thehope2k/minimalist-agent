// Runtime-rendered brand mark used as the app icon (Dock, BrowserWindow,
// notifications). The SVG is inlined so it survives bundling — no resource
// path dance between dev and packaged builds. Rasterised once with `sharp`
// and cached as a `NativeImage`.

import { nativeImage, type NativeImage } from 'electron';

// Canvas is 1024×1024 with Apple's macOS template padding (824×824 squircle).
//
// Style: deep ink-blue → teal aurora gradient with a soft top highlight,
// and an abstract orbit mark (offset thin ring + inner dot) suggesting an
// agent observing / circling. Drops the sparkle motif (overused) for a
// cleaner geometric statement.
const SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="bg" x1="0.1" y1="0" x2="0.9" y2="1">
      <stop offset="0%" stop-color="#0a1530"/>
      <stop offset="55%" stop-color="#16395f"/>
      <stop offset="100%" stop-color="#1f8a8a"/>
    </linearGradient>
    <radialGradient id="hl" cx="0.5" cy="0.0" r="0.85">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.22"/>
      <stop offset="60%" stop-color="#ffffff" stop-opacity="0.04"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="#7dd3d3" stop-opacity="0.85"/>
    </linearGradient>
  </defs>
  <rect x="100" y="100" width="824" height="824" rx="185" fill="url(#bg)"/>
  <rect x="100" y="100" width="824" height="824" rx="185" fill="url(#hl)"/>
  <!-- Outer orbit ring (offset slightly upper-right to imply motion) -->
  <ellipse
    cx="540" cy="488"
    rx="232" ry="232"
    fill="none"
    stroke="url(#ring)"
    stroke-width="22"
    stroke-linecap="round"/>
  <!-- Open arc on the lower-left quadrant — break in the ring adds tension -->
  <path
    d="M 320 540
       A 232 232 0 0 1 360 360"
    fill="none"
    stroke="#0a1530"
    stroke-width="38"
    stroke-linecap="round"/>
  <!-- Solid agent dot, positioned at the break to suggest it's "moving" -->
  <circle cx="332" cy="440" r="62" fill="#ffffff"/>
</svg>`;

let cached: NativeImage | null = null;
let pending: Promise<NativeImage | null> | null = null;

export async function getAppIcon(): Promise<NativeImage | null> {
  if (cached) return cached;
  if (pending) return pending;
  pending = (async () => {
    try {
      const { default: sharp } = await import('sharp');
      const png = await sharp(Buffer.from(SVG)).png().toBuffer();
      cached = nativeImage.createFromBuffer(png);
      return cached;
    } catch {
      return null;
    } finally {
      pending = null;
    }
  })();
  return pending;
}
