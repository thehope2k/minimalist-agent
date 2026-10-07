import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export function sessionScratchDir(sessionPath: string): string {
  return join(sessionPath, 'scratch');
}

export function ensureSessionScratchDir(sessionPath: string): void {
  mkdirSync(sessionScratchDir(sessionPath), { recursive: true });
}

export function resolveChatWorkingDirectory(cwd: string | undefined, sessionPath: string): string {
  return cwd ?? sessionScratchDir(sessionPath);
}
