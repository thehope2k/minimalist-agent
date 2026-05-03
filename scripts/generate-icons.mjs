// Build-time icon generator. Produces:
//
//   build/icon.png   — 1024×1024, used by electron-builder for Linux + as
//                      the source for the auto-generated Windows .ico.
//   build/icon.icns  — macOS app bundle icon. Skipped on non-Darwin hosts
//                      since `iconutil` is macOS-only (and you can only
//                      build a .app on macOS anyway).
//
// SVG source is duplicated from `src/main/app-icon.ts` — keep them in sync
// when changing the brand mark. The runtime path uses the constant in
// app-icon.ts (Dock / window / notifications); this script feeds the
// PACKAGED bundle path (Finder / Applications / Spotlight).
//
// Run via `npm run generate-icons` or implicitly through `npm run pack`
// (wired as the `prepack` script in package.json).

import {
  existsSync,
  mkdirSync,
  rmSync,
} from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = join(here, '..');
const buildDir = join(repoRoot, 'build');
const iconsetDir = join(buildDir, 'icon.iconset');

// Mirror of `src/main/app-icon.ts`. Edit both together.
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
  <ellipse
    cx="540" cy="488"
    rx="232" ry="232"
    fill="none"
    stroke="url(#ring)"
    stroke-width="22"
    stroke-linecap="round"/>
  <path
    d="M 320 540
       A 232 232 0 0 1 360 360"
    fill="none"
    stroke="#0a1530"
    stroke-width="38"
    stroke-linecap="round"/>
  <circle cx="332" cy="440" r="62" fill="#ffffff"/>
</svg>`;

// Apple-required iconset filenames + pixel sizes (logical vs @2x).
const ICONSET_ENTRIES = [
  { name: 'icon_16x16.png', size: 16 },
  { name: 'icon_16x16@2x.png', size: 32 },
  { name: 'icon_32x32.png', size: 32 },
  { name: 'icon_32x32@2x.png', size: 64 },
  { name: 'icon_128x128.png', size: 128 },
  { name: 'icon_128x128@2x.png', size: 256 },
  { name: 'icon_256x256.png', size: 256 },
  { name: 'icon_256x256@2x.png', size: 512 },
  { name: 'icon_512x512.png', size: 512 },
  { name: 'icon_512x512@2x.png', size: 1024 },
];

async function renderPng(size, outPath) {
  await sharp(Buffer.from(SVG))
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(outPath);
}

async function main() {
  mkdirSync(buildDir, { recursive: true });

  // Cross-platform: 1024×1024 master PNG. electron-builder uses this for
  // Linux directly and converts to ICO for Windows when no .ico is provided.
  const masterPng = join(buildDir, 'icon.png');
  await renderPng(1024, masterPng);
  console.log(`✓ ${masterPng}`);

  if (process.platform !== 'darwin') {
    // Don't try to call iconutil on Linux/Windows hosts. macOS bundles can
    // only be built on macOS anyway.
    console.log('· Skipping icon.icns (host platform is not macOS).');
    return;
  }

  // Build the iconset directory required by `iconutil`.
  if (existsSync(iconsetDir)) rmSync(iconsetDir, { recursive: true });
  mkdirSync(iconsetDir, { recursive: true });
  await Promise.all(
    ICONSET_ENTRIES.map((e) => renderPng(e.size, join(iconsetDir, e.name))),
  );

  const icnsPath = join(buildDir, 'icon.icns');
  execSync(
    `iconutil -c icns "${iconsetDir}" -o "${icnsPath}"`,
    { stdio: 'inherit' },
  );
  rmSync(iconsetDir, { recursive: true });
  console.log(`✓ ${icnsPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
