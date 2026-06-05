// Hardening for renderer-initiated terminal spawns.
//
// The terminal is a user-facing, general-purpose shell, so we deliberately do
// NOT jail it to the project root (the panel's documented default cwd includes
// the user's home dir). But `terminal:create` is reachable from the renderer,
// where a single XSS primitive could otherwise spawn a process with an
// arbitrary executable, in an arbitrary directory, inheriting the full
// main-process env (API keys / OAuth tokens). These guards close those three
// gaps without breaking legitimate interactive use.

import { readFileSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { createLogger } from '../logger';

const log = createLogger('terminal');

const WIN_SHELLS = ['powershell.exe', 'pwsh.exe', 'cmd.exe'];
const POSIX_FALLBACK_SHELLS = ['/bin/zsh', '/bin/bash', '/bin/sh'];

let shellCache: string[] | null = null;

/** Allowed login shells: `/etc/shells` on POSIX, a fixed set on Windows. */
export function allowedShells(): string[] {
  if (shellCache) return shellCache;
  if (process.platform === 'win32') {
    shellCache = WIN_SHELLS;
    return shellCache;
  }
  try {
    const raw = readFileSync('/etc/shells', 'utf-8');
    const shells = raw
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('/') && !l.startsWith('#'));
    shellCache = shells.length ? [...new Set(shells)] : POSIX_FALLBACK_SHELLS;
  } catch {
    shellCache = POSIX_FALLBACK_SHELLS;
  }
  return shellCache;
}

/** True if `shell` is a recognized login shell (exact path on POSIX). */
export function isAllowedShell(shell: string): boolean {
  const list = allowedShells();
  if (process.platform === 'win32') {
    const b = shell.toLowerCase();
    return list.some(
      (s) => b === s.toLowerCase() || b.endsWith(`\\${s.toLowerCase()}`) || b.endsWith(`/${s.toLowerCase()}`),
    );
  }
  return list.includes(shell);
}

/**
 * Resolve a renderer-supplied cwd to a real, existing directory. Symlinks are
 * resolved (so the spawned cwd is the canonical target), and anything that
 * isn't an existing directory falls back to the user's home dir — mirroring the
 * panel's own `?? homedir` default rather than throwing and breaking the open.
 */
export function resolveSafeCwd(cwd: string): string {
  const fallback = homedir() || '/';
  if (typeof cwd !== 'string' || cwd.length === 0) return fallback;
  try {
    const real = realpathSync(cwd);
    if (statSync(real).isDirectory()) return real;
    log.warn('terminal cwd is not a directory; using home dir instead');
    return fallback;
  } catch {
    log.warn('terminal cwd could not be resolved; using home dir instead');
    return fallback;
  }
}

// Env var names that typically hold credentials. Denylist (not allowlist):
// a developer terminal must keep arbitrary dev env (PATH, GOPATH, JAVA_HOME,
// nvm, …), so we strip only secret-shaped names rather than whitelisting a
// minimal set. Matched case-insensitively against the variable NAME only —
// values are never inspected or logged.
const SECRET_ENV_RE =
  /(SECRET|PASSWORD|PASSWD|TOKEN|CREDENTIAL|APIKEY|API[_-]?KEY|ACCESS[_-]?KEY|PRIVATE[_-]?KEY|_KEY$)/i;

/** Copy of `env` with credential-shaped variables removed. */
export function scrubTerminalEnv(
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined) continue;
    if (SECRET_ENV_RE.test(name)) continue;
    out[name] = value;
  }
  return out;
}
