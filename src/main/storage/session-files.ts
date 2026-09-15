import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Paths } from './paths';

/** Absolute path to the session's on-disk folder. */
export function sessionPath(id: string): string {
  return join(Paths.sessionsDir(), id);
}

export type SessionFileNode =
  | {
      kind: 'file';
      name: string;
      path: string;
      size: number;
    }
  | {
      kind: 'dir';
      name: string;
      path: string;
      children: SessionFileNode[];
    };

/**
 * Walk the session folder for the Info popover. Skips hidden files only —
 * everything else on disk (meta, append-only message log, attachments, tool
 * outputs) shows up so the panel reflects the full session folder.
 * Folders sorted before files; both alphabetically.
 */
export function listSessionFiles(id: string): SessionFileNode[] {
  const root = sessionPath(id);
  if (!existsSync(root)) return [];
  return walk(root);
}

function walk(dir: string): SessionFileNode[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const out: SessionFileNode[] = [];
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      out.push({ kind: 'dir', name: e.name, path: full, children: walk(full) });
    } else if (e.isFile()) {
      let size = 0;
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        size = statSync(full).size;
      } catch {
        // ignore unreadable
      }
      out.push({ kind: 'file', name: e.name, path: full, size });
    }
  }
  // dirs first, then files; alphabetical within each.
  out.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return out;
}
