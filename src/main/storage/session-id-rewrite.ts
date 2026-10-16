import { readFileSync, renameSync, writeFileSync } from 'node:fs';

const TRANSCRIPT_HEADER_TYPE = 'session';
const SIGNED_BLOCK_TYPE = 'thinking';

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Retargets every reference to the parent session's directory (raw, shell-quoted
 * or escaped paths, and `ma-asset://` URLs) at the branch. Thinking blocks are
 * returned untouched because providers verify their signature against the
 * exact original text.
 */
export function createSessionIdRewriter(
  sessionsDir: string,
  parentId: string,
  newId: string,
): <T>(value: T) => T {
  const pattern = new RegExp(
    `(${escapeRegExp(sessionsDir)}[\\\\/]|ma-asset://)${escapeRegExp(parentId)}(?![A-Za-z0-9])`,
    'g',
  );
  const replacement = `$1${newId}`;

  const rewrite = (value: unknown): unknown => {
    if (typeof value === 'string') return value.replace(pattern, replacement);
    if (Array.isArray(value)) return value.map(rewrite);
    if (!isRecord(value) || value.type === SIGNED_BLOCK_TYPE) return value;
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, rewrite(entry)]));
  };

  return rewrite as <T>(value: T) => T;
}

/** The header's `parentSession` must keep pointing at the real parent file. */
export function rewriteTranscriptFile(path: string, rewrite: <T>(value: T) => T): void {
  const lines = readFileSync(path, 'utf-8')
    .split('\n')
    .filter((line) => line.trim());
  const rewritten = lines.map((line) => {
    const entry = JSON.parse(line) as { type?: string };
    return entry.type === TRANSCRIPT_HEADER_TYPE ? line : JSON.stringify(rewrite(entry));
  });

  const tmpPath = `${path}.tmp`;
  writeFileSync(tmpPath, `${rewritten.join('\n')}\n`, 'utf-8');
  renameSync(tmpPath, path);
}
