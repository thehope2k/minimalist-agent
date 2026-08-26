// Catastrophic-delete circuit breaker for the Bash tool.
//
// Not a permission system, not a maintained list — a single fixed check for
// one failure mode: a recursive+forced delete that resolves to the
// filesystem root, the user's home directory, or the working tree itself.
// That mistake is common (agent confusion about cwd, a bad variable
// expansion, a miscomputed path in a plan step) and irreversible, which is a
// different risk category from "everyday" operations the autonomy slider
// already governs.
//
// Deliberately narrow: this does not defend against deliberate obfuscation
// (base64'd commands, `python -c "shutil.rmtree(...)"`, piping through
// `eval`, etc.) — that's a sandboxing problem, out of scope for a single-user
// desktop tool. This is a reducer for the boring mistake (wrong cwd, a bad
// variable expansion, a miscomputed path), not a security boundary.
//
// No configuration, no allow/deny rules to maintain — the categories below
// are fixed and don't grow over time, same spirit as `ALWAYS_CONFIRM` in
// shared/autonomy.ts.

import { homedir } from 'node:os';
import { dirname, resolve, sep } from 'node:path';

function hasRecursiveFlag(tokens: string[]): boolean {
  return tokens.some(
    (t) => t === '-r' || t === '-R' || t === '--recursive' || /^-[a-zA-Z]*[rR][a-zA-Z]*$/.test(t),
  );
}

function hasForceFlag(tokens: string[]): boolean {
  return tokens.some(
    (t) => t === '-f' || t === '--force' || /^-[a-zA-Z]*f[a-zA-Z]*$/.test(t),
  );
}

function splitSegments(command: string): string[] {
  return command
    .split(/(?:;|&&|\|\||\||\n)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Only resolves values assigned earlier in the same command string (e.g.
// `DIR=/ && rm -rf "$DIR"`) — anything else stays unresolved and is handled
// conservatively by the caller rather than assumed safe.
function collectInlineAssignments(command: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /(?:^|[\s;])([A-Za-z_][A-Za-z0-9_]*)=("[^"]*"|'[^']*'|\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(command))) {
    out.set(m[1], stripQuotes(m[2]));
  }
  return out;
}

// Not a shell parser — just enough to not be fooled by a quoted variable
// reference like `"$DIR"/*` when checking the expanded path shape.
function stripQuotes(s: string): string {
  return s.replace(/["']/g, '');
}

function expandTarget(target: string, assignments: Map<string, string>): { path: string; unresolved: boolean } {
  let unresolved = false;
  let out = stripQuotes(target);
  if (out === '~' || out.startsWith('~/')) {
    out = homedir() + out.slice(1);
  }
  out = out.replace(/\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?/g, (_full, name: string) => {
    if (name === 'HOME') return homedir();
    const v = assignments.get(name);
    if (v !== undefined) return v;
    unresolved = true;
    return '\u0000UNRESOLVED\u0000';
  });
  return { path: out, unresolved };
}

function ancestorsInclusive(dir: string): string[] {
  const out: string[] = [];
  let cur = resolve(dir);
  for (;;) {
    out.push(cur);
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return out;
}

function isFilesystemRoot(p: string): boolean {
  // POSIX root, or a Windows drive root like "C:\" / "C:/".
  return p === sep || /^[A-Za-z]:[\\/]?$/.test(p);
}

/** `null` if `resolvedTarget` is outside every guarded category; otherwise the reason. */
function checkGuardedTarget(
  resolvedTarget: string,
  guardedRoots: Set<string>,
): string | null {
  if (isFilesystemRoot(resolvedTarget)) return `target resolves to the filesystem root (${resolvedTarget})`;
  if (resolvedTarget === homedir()) return `target resolves to the home directory (${resolvedTarget})`;
  if (guardedRoots.has(resolvedTarget)) {
    return `target resolves to the working directory or one of its parents (${resolvedTarget})`;
  }
  return null;
}

/**
 * Checks one `rm`/`rmdir` target argument against the guarded categories,
 * including the case where it's a glob rooted at a guarded directory
 * (`~/*`, `$DIR/*`). Returns a reason string if it matches, `null` otherwise.
 */
function checkTarget(
  rawTarget: string,
  cwd: string,
  guardedRoots: Set<string>,
  assignments: Map<string, string>,
): string | null {
  const { path: expanded, unresolved } = expandTarget(rawTarget, assignments);
  const isGlob = expanded === '*' || expanded.endsWith('/*') || expanded.endsWith('\\*');

  // An unresolved variable feeding a glob can't be verified safe, so it's
  // treated the same as a match rather than assumed harmless.
  if (unresolved) {
    return isGlob ? `unresolved variable "${rawTarget}" expands to a glob this check can't verify is safe` : null;
  }

  const resolvedTarget = resolve(cwd, expanded);
  const directHit = checkGuardedTarget(resolvedTarget, guardedRoots);
  if (directHit) return directHit;
  if (!isGlob) return null;

  const globRoot = resolve(cwd, expanded.replace(/[/\\]\*$/, '') || sep);
  const globHit = checkGuardedTarget(globRoot, guardedRoots);
  return globHit ? `glob target wipes everything under a guarded directory (${globRoot})` : null;
}

/**
 * Returns a human-readable reason if `command` contains a recursive+forced
 * `rm`/`rmdir` whose target resolves to the filesystem root, the user's home
 * directory, or the working directory / one of its parents. Returns `null`
 * if the command doesn't match this narrow, fixed set of categories.
 */
export function describeCatastrophicRm(command: string, cwd: string): string | null {
  const assignments = collectInlineAssignments(command);
  const guardedRoots = new Set<string>([homedir(), ...ancestorsInclusive(cwd)]);

  for (const segment of splitSegments(command)) {
    const tokens = segment.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;

    const cmdName = tokens[0].split('/').pop() ?? tokens[0];
    if (cmdName !== 'rm' && cmdName !== 'rmdir') continue;

    const rest = tokens.slice(1);
    const flags = rest.filter((t) => t.startsWith('-'));
    const targets = rest.filter((t) => !t.startsWith('-'));
    if (targets.length === 0) continue;

    const recursive = cmdName === 'rmdir' || hasRecursiveFlag(flags);
    const forced = cmdName === 'rmdir' || hasForceFlag(flags);
    if (!recursive || !forced) continue;

    for (const rawTarget of targets) {
      const reason = checkTarget(rawTarget, cwd, guardedRoots, assignments);
      if (reason) return reason;
    }
  }

  return null;
}
