// Shared utilities for Pi subprocess spawning
// IMPORTANT: This file must NOT import Electron modules because it's used
// by pi-server.ts which runs as a Node subprocess (ELECTRON_RUN_AS_NODE=1).

import { join } from 'node:path';
import { existsSync } from 'node:fs';

/**
 * Resolve the path to the pi-server.js subprocess bundle.
 * Checks multiple candidates relative to the provided app path.
 * 
 * @param appPath - The Electron app.getAppPath() value (passed from main process)
 */
export function resolvePiServerPath(appPath: string): string {
  const candidates = [
    join(appPath, 'out', 'main', 'pi-server.js'),
    join(appPath, 'pi-server.js'),
    join(process.cwd(), 'out', 'main', 'pi-server.js'),
  ];
  
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  
  throw new Error(
    `pi-server.js not found in any of:\n  ${candidates.join('\n  ')}\n` +
    `Run \`npm run build\` so electron-vite emits the subprocess bundle.`,
  );
}
