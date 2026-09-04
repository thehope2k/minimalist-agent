// Builds the `Options` we hand to `@anthropic-ai/claude-agent-sdk`'s
// `query()`. Splits cleanly into three concerns:
//
//   1. ensureClaudeConfig() — repairs ~/.claude.json corruption (BOM,
//      empty file, stale `.backup`, `.corrupted.*`) so the SDK
//      subprocess doesn't print plain-text recovery messages on stdout
//      (which crashes the JSON transport with "CLI output was not
//      valid JSON").
//   2. buildClaudeSubprocessEnv() — proxy vars carried through, Bedrock
//      routing vars stripped, accepts per-call env overrides for auth.
//   3. getDefaultOptions() — assembles `executable`, `executableArgs`,
//      `pathToClaudeCodeExecutable`, and `env` for the SDK call.
//
// We run the SDK's bundled `cli.js` under `node` rather than relying on a
// system-wide `claude` binary — vanilla npm installs don't ship one, and
// shelling to a packaged native binary is out of scope for v1.

import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import type { Options } from '@anthropic-ai/claude-agent-sdk';

const UTF8_BOM = '\uFEFF';

let claudeConfigChecked = false;
let cachedCliPath: string | null | undefined;

/* -------------------- ~/.claude.json repair ----------------------- */

/**
 * Run once per process. Causes of corruption (from public claude-code
 * GitHub issues):
 *   - UTF-8 BOM on Windows — editors/auth writes add a BOM prefix
 *   - Empty file from a crash mid-write
 *   - Stale `.backup` file → CLI prints recovery instructions to stdout
 *   - `.corrupted.*` files → CLI alters its stdout output
 *
 * Any of these turns the SDK transport's first read into a JSON parse error.
 */
function ensureClaudeConfig(): void {
  if (claudeConfigChecked) return;
  claudeConfigChecked = true;

  const configPath = join(homedir(), '.claude.json');

  // Stale .backup → CLI writes "A backup file exists at..." on stdout.
  const backupPath = `${configPath}.backup`;
  if (existsSync(backupPath)) {
    try { unlinkSync(backupPath); } catch { /* best effort */ }
  }

  // Old .corrupted.* markers also alter CLI stdout.
  try {
    const home = homedir();
    for (const f of readdirSync(home)) {
      if (f.startsWith('.claude.json.corrupted.')) {
        try { unlinkSync(join(home, f)); } catch { /* best effort */ }
      }
    }
  } catch { /* if we can't read homedir, skip */ }

  if (!existsSync(configPath)) {
    writeConfigSafe(configPath, '{}');
    return;
  }

  try {
    const raw = readFileSync(configPath, 'utf-8');
    const content = raw.startsWith(UTF8_BOM) ? raw.slice(1) : raw;
    const hadBom = raw !== content;

    if (content.trim().length === 0) {
      writeConfigSafe(configPath, '{}');
      return;
    }
    JSON.parse(content);
    if (hadBom) writeConfigSafe(configPath, content);
  } catch {
    // Invalid JSON — reset. Loses CLI history but prevents subprocess crash.
    writeConfigSafe(configPath, '{}');
  }
}

/** Write with a one-shot retry for transient EBUSY/EPERM on Windows. */
function writeConfigSafe(path: string, content: string): void {
  try {
    writeFileSync(path, content, 'utf-8');
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (process.platform === 'win32' && (code === 'EBUSY' || code === 'EPERM')) {
      const start = Date.now();
      while (Date.now() - start < 100) { /* busy wait — runs once at startup */ }
      try { writeFileSync(path, content, 'utf-8'); } catch { /* give up */ }
    }
  }
}

/* -------------------- cli.js path resolution ---------------------- */

/**
 * Locate `<sdk>/cli.js` so we can run the SDK under `node` instead of its
 * native `claude` binary. Older SDK versions (≤ 0.2.111) shipped this file;
 * 0.2.12x dropped it and runs in-process via `sdk.mjs` instead. Returns the
 * path when present so we can pin `pathToClaudeCodeExecutable` for legacy
 * SDKs, or null on newer ones (the SDK then resolves its own entry).
 */
function resolveClaudeCliJs(): string | null {
  if (cachedCliPath !== undefined) return cachedCliPath;
  const require = createRequire(import.meta.url);
  try {
    const sdkEntry = require.resolve('@anthropic-ai/claude-agent-sdk');
    const cliPath = join(dirname(sdkEntry), 'cli.js');
    cachedCliPath = existsSync(cliPath) ? cliPath : null;
  } catch {
    cachedCliPath = null;
  }
  return cachedCliPath;
}

/**
 * Whether the Claude Agent SDK package itself is resolvable. Used by
 * callers to fail fast on a broken install. Decoupled from whether the
 * legacy cli.js bundle exists, since modern SDKs run in-process.
 */
let cachedSdkAvailable: boolean | undefined;
function isClaudeSdkAvailable(): boolean {
  if (cachedSdkAvailable !== undefined) return cachedSdkAvailable;
  const require = createRequire(import.meta.url);
  try {
    require.resolve('@anthropic-ai/claude-agent-sdk');
    cachedSdkAvailable = true;
  } catch {
    cachedSdkAvailable = false;
  }
  return cachedSdkAvailable;
}

/**
 * Locate the platform-specific `claude` native binary that the modern SDK
 * (≥ 0.2.12x) ships as an optional dependency. Without an explicit pin
 * the SDK's auto-resolution can fail inside Electron's module-loader,
 * spawning a broken subprocess that exits with EPIPE.
 */
let cachedNativeBinary: string | null | undefined;
function resolveClaudeNativeBinary(): string | null {
  if (cachedNativeBinary !== undefined) return cachedNativeBinary;
  const require = createRequire(import.meta.url);
  // Node uses `arm64` / `x64` / etc; the package suffix matches.
  const platformSuffix = `${process.platform}-${process.arch}`;
  const pkgName = `@anthropic-ai/claude-agent-sdk-${platformSuffix}`;
  const exeName = process.platform === 'win32' ? 'claude.exe' : 'claude';
  try {
    // Resolve via package.json so we get the package root, not its main.
    const pkgJson = require.resolve(`${pkgName}/package.json`);
    const candidate = join(dirname(pkgJson), exeName);
    cachedNativeBinary = existsSync(candidate) ? candidate : null;
  } catch {
    cachedNativeBinary = null;
  }
  return cachedNativeBinary;
}

/* -------------------- subprocess env ------------------------------ */

export function buildClaudeSubprocessEnv(
  envOverrides?: Record<string, string>,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...envOverrides,
  };

  // Bedrock must never route through this Claude SDK path. Strip only
  // Claude-specific Bedrock routing vars; leave generic AWS_* alone so user
  // shell tooling inside the subprocess still works.
  delete env.CLAUDE_CODE_USE_BEDROCK;
  delete env.AWS_BEARER_TOKEN_BEDROCK;
  delete env.ANTHROPIC_BEDROCK_BASE_URL;

  return env;
}

/* -------------------- assembled defaults -------------------------- */

export interface DefaultOptionsInput {
  /** Per-session env vars (e.g. ANTHROPIC_API_KEY / CLAUDE_CODE_OAUTH_TOKEN). */
  envOverrides?: Record<string, string>;
}

export function getDefaultOptions(
  input: DefaultOptionsInput = {},
): Partial<Options> {
  ensureClaudeConfig();

  // SECURITY: disable Bun's automatic .env loading in the SDK subprocess.
  // Without this, Bun loads .env from the subprocess cwd (the user's
  // working directory) and can silently inject ANTHROPIC_API_KEY,
  // overriding our OAuth auth and charging the user's API key instead of
  // their Pro/Max plan. Harmless under Node, where there's no auto-load.
  const nullDevice = process.platform === 'win32' ? 'NUL' : '/dev/null';
  const envFileFlag = `--env-file=${nullDevice}`;

  const cliJs = resolveClaudeCliJs();
  const base: Partial<Options> = {
    env: buildClaudeSubprocessEnv(input.envOverrides),
  };
  if (cliJs) {
    // Legacy SDK (≤ 0.2.111) — point Node at the bundled cli.js and pin
    // the JS runtime so we don't accidentally inherit Bun's auto-env.
    base.executable = 'node';
    base.executableArgs = [envFileFlag];
    base.pathToClaudeCodeExecutable = cliJs;
  } else {
    // Modern SDK (≥ 0.2.12x) — point at the platform-specific native
    // binary explicitly. Letting the SDK auto-resolve breaks under
    // Electron's module loader and the subprocess exits with EPIPE.
    const nativeBin = resolveClaudeNativeBinary();
    if (nativeBin) base.pathToClaudeCodeExecutable = nativeBin;
  }
  return base;
}

/**
 * Exposed so callers (claude.ts, title.ts) can fail fast on a broken
 * install. Returns true on any usable SDK version (legacy with `cli.js`
 * or modern in-process `sdk.mjs`).
 */
export function locateClaudeCli(): boolean {
  return isClaudeSdkAvailable();
}
