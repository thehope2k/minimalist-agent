import { promises as fsp, type Dirent } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import type { SddArtifactSet, SddEntity, SddEntityRole, SddFeature, SddScanResult } from './types';
import { deriveSddPhase } from './phase';
import { countCheckboxes } from './artifact';
import { getSettings, DEFAULT_SDD_SCAN_DEPTH } from '../storage/settings';
import { normalise } from './utils';

const execFile = promisify(execFileCb);

/**
 * Directories never descended into during the SDD scan.
 * Kept in sync with EXCLUDED_DIRECTORIES in agent/system-prompt.ts.
 */
export const SDD_EXCLUDED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', 'coverage',
  'vendor', '.cache', '.turbo', 'out', '.output', '.venv', 'venv',
  '__pycache__', '.pytest_cache', 'target', '.gradle',
]);

// ── Path helpers ─────────────────────────────────────────────────────────────

async function pathExists(p: string): Promise<boolean> {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(p: string): Promise<boolean> {
  try {
    return (await fsp.stat(p)).isDirectory();
  } catch {
    return false;
  }
}

// ── Artifact helpers ────────────────────────────────────────────────────────

async function readCheckboxStats(filePath: string): Promise<{ total: number; checked: number }> {
  try {
    const content = await fsp.readFile(filePath, 'utf-8');
    return countCheckboxes(content);
  } catch {
    return { total: 0, checked: 0 };
  }
}

/** Core artifact filenames — always tracked for phase derivation. */
const CORE_ARTIFACTS = new Set(['spec.md', 'plan.md', 'tasks.md']);

async function buildArtifactSet(featureDir: string): Promise<SddArtifactSet> {
  const specPath = join(featureDir, 'spec.md');
  const planPath = join(featureDir, 'plan.md');
  const tasksPath = join(featureDir, 'tasks.md');

  const [hasSpec, hasPlan, hasTasks] = await Promise.all([
    pathExists(specPath),
    pathExists(planPath),
    pathExists(tasksPath),
  ]);

  let taskCompletionRatio = -1;
  let taskCount = 0;
  let hasImplementation = false;

  if (hasTasks) {
    const { total, checked } = await readCheckboxStats(tasksPath);
    taskCount = total;
    taskCompletionRatio = total > 0 ? checked / total : 0;
    hasImplementation = checked > 0;
  }

  // Collect mtimes for stale-artifact detection in the UI.
  const artifactMtimes: Partial<Record<'spec' | 'plan' | 'tasks', number>> = {};
  if (hasSpec) {
    try { artifactMtimes.spec = (await fsp.stat(specPath)).mtimeMs; } catch { /* ignore */ }
  }
  if (hasPlan) {
    try { artifactMtimes.plan = (await fsp.stat(planPath)).mtimeMs; } catch { /* ignore */ }
  }
  if (hasTasks) {
    try { artifactMtimes.tasks = (await fsp.stat(tasksPath)).mtimeMs; } catch { /* ignore */ }
  }

  // Scan for any additional .md files — custom phase artifacts from team
  // workflows (e.g. arch-intent.md, test-cases-acceptance.md). These are
  // surfaced as-is without requiring hardcoded knowledge of team conventions.
  let extraArtifacts: string[] = [];
  try {
    const entries = await fsp.readdir(featureDir, { withFileTypes: true });
    extraArtifacts = entries
      .filter(
        (e) =>
          e.isFile() &&
          e.name.endsWith('.md') &&
          !CORE_ARTIFACTS.has(e.name.toLowerCase()),
      )
      .map((e) => e.name)
      .sort();
  } catch { /* empty — feature dir may not exist yet */ }

  return {
    hasSpec,
    hasPlan,
    hasTasks,
    hasImplementation,
    taskCompletionRatio,
    taskCount,
    extraArtifacts,
    artifactMtimes,
  };
}

// ── Constitution check ────────────────────────────────────────────────────────

async function checkHasConstitution(constitutionPath: string): Promise<boolean> {
  if (!(await pathExists(constitutionPath))) return false;
  try {
    const content = await fsp.readFile(constitutionPath, 'utf-8');
    // Treat the template placeholder as missing — content not yet written.
    return !content.includes('This file is a placeholder');
  } catch {
    return false;
  }
}

// ── Feature scan ────────────────────────────────────────────────────────────

async function scanFeatures(specsDir: string): Promise<SddFeature[]> {
  if (!(await pathExists(specsDir))) return [];

  let entries: Dirent[];
  try {
    entries = await fsp.readdir(specsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  // Constitution is entity-level — hoist the check out of the feature loop.
  const constitutionPath = join(specsDir, '..', 'memory', 'constitution.md');
  const hasConstitution = await checkHasConstitution(constitutionPath);

  const featurePromises = entries
    .filter((e) => e.isDirectory())
    .map(async (e) => {
      const featurePath = join(specsDir, e.name);
      const match = e.name.match(/^(\d+)-(.+)$/);
      const number = match?.[1] ?? '';
      const slug = match?.[2] ?? e.name;
      const artifacts = await buildArtifactSet(featurePath);
      return {
        path: featurePath,
        name: e.name,
        number,
        slug,
        artifacts,
        currentPhase: deriveSddPhase(artifacts, hasConstitution),
      } satisfies SddFeature;
    });

  const features = await Promise.all(featurePromises);
  return features.sort((a, b) => a.number.localeCompare(b.number));
}

// ── Entity role inference ───────────────────────────────────────────────────

async function inferRole(
  entityRootPath: string,
  cwd: string,
  depth: number,
): Promise<SddEntityRole> {
  // Standalone: CWD itself is the entity root (spec-only repo as session root)
  if (entityRootPath === cwd) return depth === 0 ? 'standalone' : 'shared';

  const parent = dirname(entityRootPath);

  // Shared: entity is directly at cwd root with other siblings
  if (parent === cwd) {
    // Check if the entity root contains non-.specify/ content
    let hasCode = false;
    try {
      const siblings = await fsp.readdir(entityRootPath, { withFileTypes: true });
      hasCode = siblings.some(
        (s) => s.name !== '.specify' && !s.name.startsWith('.'),
      );
    } catch { /* empty */ }

    if (!hasCode) {
      // Paired: check if a sibling dir has a similar name
      try {
        const cwdSiblings = (await fsp.readdir(cwd, { withFileTypes: true }))
          .filter((s) => s.isDirectory() && s.name !== basename(entityRootPath));
        const entityName = normalise(basename(entityRootPath));
        const hasPair = cwdSiblings.some(
          (s) => entityName.includes(normalise(s.name)) || normalise(s.name).includes(entityName),
        );
        return hasPair ? 'paired' : 'standalone';
      } catch {
        return 'standalone';
      }
    }
    return 'embedded';
  }

  return 'embedded';
}

// ── feature.json helpers ─────────────────────────────────────────────────────

/**
 * Read .specify/feature.json and extract the active feature slug.
 * Returns null when the file is absent, malformed, or has no feature_directory.
 * The CLI writes this file when the user runs `specify feature set <slug>`.
 */
async function readDefaultFeatureSlug(specifyPath: string): Promise<string | null> {
  try {
    const raw = await fsp.readFile(join(specifyPath, 'feature.json'), 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return null;
    const dir = (parsed as Record<string, unknown>).feature_directory;
    if (typeof dir !== 'string' || !dir) return null;
    // feature_directory is like "specs/003-smart-sdd-context" (speckit convention:
    // specs live at $repo_root/specs/, not inside .specify/).
    // Extract just the folder name (last segment) to match against scanned features.
    return dir.split('/').at(-1) ?? null;
  } catch {
    return null;
  }
}

// ── Main walk ─────────────────────────────────────────────────────────────────

async function walk(
  dir: string,
  cwd: string,
  depth: number,
  results: SddEntity[],
  maxDepth: number,
): Promise<void> {
  if (depth > maxDepth) return;

  const specifyPath = join(dir, '.specify');
  if (await isDirectory(specifyPath)) {
    const constitutionPath = join(specifyPath, 'memory', 'constitution.md');
    // speckit convention: specs live at $repo_root/specs/, not inside .specify/.
    // Also check .specify/specs/ as a fallback for projects created before this
    // was corrected (backward-compat — will be removed in a future release).
    const specsDir = join(dir, 'specs');
    const legacySpecsDir = join(specifyPath, 'specs');
    const useLegacy = !(await isDirectory(specsDir)) && (await isDirectory(legacySpecsDir));
    const [features, hasConstitution, defaultFeatureSlug] = await Promise.all([
      scanFeatures(useLegacy ? legacySpecsDir : specsDir),
      checkHasConstitution(constitutionPath),
      readDefaultFeatureSlug(specifyPath),
    ]);

    // Collect constitution mtime for stale-detection in the viewer.
    let constitutionMtime: number | undefined;
    if (hasConstitution) {
      try { constitutionMtime = (await fsp.stat(constitutionPath)).mtimeMs; } catch { /* ignore */ }
    }

    results.push({
      specifyPath,
      rootPath: dir,
      name: basename(dir) || basename(cwd),
      role: await inferRole(dir, cwd, depth),
      features,
      hasConstitution,
      constitutionMtime,
      defaultFeatureSlug,
    });
    // Don't descend further into a repo that already has .specify/
    return;
  }

  let entries: Dirent[];
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  // Traverse sibling directories concurrently for speed.
  await Promise.all(
    entries
      .filter((e) => e.isDirectory() && !SDD_EXCLUDED_DIRS.has(e.name))
      .map((e) => walk(join(dir, e.name), cwd, depth + 1, results, maxDepth)),
  );
}

// ── CLI detection ─────────────────────────────────────────────────────────────

/**
 * Attempt to run `specify version`. Returns availability and the detected
 * version string. Version is extracted from stdout (e.g. "0.8.5").
 */
async function detectCli(): Promise<{ available: boolean; version: string | null }> {
  try {
    const { stdout } = await execFile('specify', ['version'], { timeout: 3000 });
    // Match semver-like string: "0.8.5" or "specify v0.8.5" etc.
    const match = stdout.trim().match(/(\d+\.\d+\.\d+(?:-[\w.]+)?)/);
    return { available: true, version: match?.[1] ?? null };
  } catch {
    return { available: false, version: null };
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Scan the workspace rooted at `cwd` for all `.specify/` entities.
 * Returns entities sorted by path depth (shallowest first).
 * Async — does not block the Electron main-process event loop.
 */
export async function scanForEntities(cwd: string): Promise<SddScanResult> {
  const maxDepth = getSettings().sddScanDepth ?? DEFAULT_SDD_SCAN_DEPTH;
  const entities: SddEntity[] = [];
  await walk(cwd, cwd, 0, entities, maxDepth);
  entities.sort((a, b) => a.rootPath.localeCompare(b.rootPath));

  const cliInfo = entities.length > 0 ? await detectCli() : { available: true, version: null };
  return {
    entities,
    cliMissing: entities.length > 0 ? !cliInfo.available : false,
    scannedDepth: maxDepth,
    cliVersion: cliInfo.version,
  };
}

/**
 * Resolve the active entity for a given CWD from a list of entities.
 * Returns the entity whose rootPath most specifically contains the CWD.
 *
 * Uses path-separator-aware prefix matching to avoid false matches between
 * sibling paths like /foo/bar and /foo/bar-app.
 */
export function resolveActiveEntity(
  entities: SddEntity[],
  cwd: string,
): string | null {
  if (entities.length === 0) return null;
  if (entities.length === 1) return entities[0].rootPath;

  let best: SddEntity | null = null;
  let bestLen = -1;
  for (const e of entities) {
    const normalizedRoot = e.rootPath.endsWith('/') ? e.rootPath : e.rootPath + '/';
    if (
      (cwd === e.rootPath || cwd.startsWith(normalizedRoot)) &&
      e.rootPath.length > bestLen
    ) {
      best = e;
      bestLen = e.rootPath.length;
    }
  }
  return best?.rootPath ?? null;
}
