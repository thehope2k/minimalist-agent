// Reconstructs the content that should be committed from a set of staged
// hunks. Unstaged hunks are reverted to the original content so the disk
// file is untouched.
//
// Monaco ILineChange conventions:
//   modifiedEndLineNumber === 0  → pure deletion (no modified lines)
//   originalEndLineNumber === 0  → pure insertion (no original lines)
//
// All line numbers are 1-indexed.

import type * as MonacoType from 'monaco-editor';
import type { GitFileStatus, GitRepo, LineChange } from './types';

export function applySelectedHunks(
  originalContent: string,
  modifiedContent: string,
  changes: LineChange[],
  stagedIndices: Set<number>,
): string {
  if (changes.length === 0) return modifiedContent;

  // Split preserving trailing newline as an empty last element.
  const origLines = originalContent.split('\n');
  const modLines = modifiedContent.split('\n');
  const result: string[] = [];

  let modCursor = 1; // 1-indexed, next modified line to process

  for (let i = 0; i < changes.length; i++) {
    const c = changes[i];
    const staged = stagedIndices.has(i);
    const hasMod = c.modifiedEndLineNumber > 0; // false = pure deletion
    const hasOrig = c.originalEndLineNumber > 0; // false = pure insertion

    // Output unchanged modified lines that come before this hunk.
    // For pure deletions (hasMod=false), modifiedStartLineNumber is the anchor
    // line before the deletion — output up to and including it.
    const unchangedEnd = hasMod ? c.modifiedStartLineNumber - 1 : c.modifiedStartLineNumber;
    while (modCursor <= unchangedEnd) {
      result.push(modLines[modCursor - 1]);
      modCursor++;
    }

    if (staged) {
      // Include the modified version of this hunk.
      if (hasMod) {
        for (let l = c.modifiedStartLineNumber; l <= c.modifiedEndLineNumber; l++) {
          result.push(modLines[l - 1]);
        }
        modCursor = c.modifiedEndLineNumber + 1;
      }
      // Pure deletion staged: just leave modCursor where it is (deletion stays).
    } else {
      // Revert this hunk: use original lines instead.
      if (hasOrig) {
        for (let l = c.originalStartLineNumber; l <= c.originalEndLineNumber; l++) {
          result.push(origLines[l - 1]);
        }
      }
      // Skip past modified lines for this hunk.
      if (hasMod) {
        modCursor = c.modifiedEndLineNumber + 1;
      }
    }
  }

  // Output any remaining modified lines after the last hunk.
  while (modCursor <= modLines.length) {
    result.push(modLines[modCursor - 1]);
    modCursor++;
  }

  return result.join('\n');
}

/** Derive a human-readable label for a hunk (e.g. "+3" / "-1" / "+2 -1"). */
export function hunkLabel(c: LineChange): string {
  const added = c.modifiedEndLineNumber > 0
    ? c.modifiedEndLineNumber - c.modifiedStartLineNumber + 1
    : 0;
  const removed = c.originalEndLineNumber > 0
    ? c.originalEndLineNumber - c.originalStartLineNumber + 1
    : 0;
  if (added > 0 && removed > 0) return `+${added} -${removed}`;
  if (added > 0) return `+${added}`;
  return `-${removed}`;
}

/** Picks the repo root relevant to an amend action — the one with staged files, or the first repo. */
export function resolveAmendRepoRoot(
  repos: GitRepo[],
  stagedPaths: Set<string>,
  cwd: string | null,
): string | null {
  return (
    repos.find((r) => r.files.some((f) => stagedPaths.has(f.absolutePath)))?.root ??
    repos[0]?.root ??
    cwd ??
    null
  );
}

export interface LastCommitFileEntry {
  status: GitFileStatus;
  path: string;
  /** Set for renames (status 'R') — the path before the rename. */
  oldPath?: string;
}

/**
 * Parses the tab-separated `git show --name-status` output returned by
 * `getLastCommitFiles`, e.g. "M\tsrc/foo.ts\nR100\told.ts\tnew.ts".
 */
export function parseLastCommitFiles(raw: string): LastCommitFileEntry[] {
  const known = new Set(['M', 'A', 'D', 'R']);
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [rawStatus, ...paths] = line.split('\t');
      const code = rawStatus[0];
      if (paths.length === 2) {
        return { status: 'R' as GitFileStatus, path: paths[1], oldPath: paths[0] };
      }
      const status = (known.has(code) ? code : 'M') as GitFileStatus;
      return { status, path: paths[0] ?? line };
    });
}

/** Line range label for a hunk, e.g. "L5" or "L5-8". */
export function hunkRange(c: LineChange): string {
  const start = c.modifiedEndLineNumber === 0
    ? c.originalStartLineNumber
    : c.modifiedStartLineNumber;
  const end = c.modifiedEndLineNumber === 0
    ? c.originalEndLineNumber
    : c.modifiedEndLineNumber;
  return start === end ? `L${start}` : `L${start}-${end}`;
}
