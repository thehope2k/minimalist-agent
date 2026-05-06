/**
 * Shared SDD types used by both main process and renderer.
 * No Node.js-specific imports here so this file is safe for the renderer tsconfig.
 */

// ── Phase ────────────────────────────────────────────────────────────────────

/**
 * Canonical ordered pipeline. This is the single source of truth for phase
 * names and order. `SddPhase` is derived from it so adding a phase here
 * automatically propagates exhaustiveness errors to every Record<SddPhase,…>.
 */
export const SDD_PHASE_ORDER = [
  'constitution', // no constitution.md
  'specify',      // constitution exists, no spec
  'plan',         // spec exists, no plan
  'tasks',        // plan exists, no tasks (or tasks.md has no checkboxes yet)
  'implement',    // tasks exist with checkboxes, not all checked
  'complete',     // all tasks checked
] as const;

export type SddPhase = typeof SDD_PHASE_ORDER[number];

// ── Artifact presence ────────────────────────────────────────────────────────

export interface SddArtifactSet {
  hasSpec: boolean;
  hasPlan: boolean;
  hasTasks: boolean;
  /** True when tasks.md exists and at least one [x] checkbox is found. */
  hasImplementation: boolean;
  /** 0–1 ratio of checked tasks to total; -1 when no tasks.md. */
  taskCompletionRatio: number;
  /** Total number of GFM task checkboxes in tasks.md; 0 when tasks.md is absent. */
  taskCount: number;
  /**
   * Any additional .md files found in the feature directory beyond the
   * four core artifacts. Captures custom phase outputs (arch-intent.md,
   * test-cases-acceptance.md, etc.) without requiring hardcoded knowledge
   * of team-specific workflows.
   */
  extraArtifacts: string[];
  /**
   * Unix timestamps (ms) for the last-modified time of core artifacts.
   * Absent when the file doesn't exist or stat fails.
   * Used for stale-artifact detection (e.g., spec newer than plan → plan stale).
   */
  artifactMtimes?: Partial<Record<'spec' | 'plan' | 'tasks', number>>;
}

// ── Feature & entity ─────────────────────────────────────────────────────────

export interface SddFeature {
  /** Absolute path to the feature directory. */
  path: string;
  /** Directory name, e.g. "001-dark-mode". */
  name: string;
  /** Numeric prefix, e.g. "001". */
  number: string;
  /** Name without prefix, e.g. "dark-mode". */
  slug: string;
  artifacts: SddArtifactSet;
  currentPhase: SddPhase;
}

/** Inferred role of a SpecKit entity based on its location. */
export type SddEntityRole = 'embedded' | 'paired' | 'standalone' | 'shared';

export interface SddEntity {
  /** Absolute path to the .specify/ directory. */
  specifyPath: string;
  /** Absolute path to the parent directory containing .specify/. */
  rootPath: string;
  /** Display name (last segment of rootPath, or cwd basename for shared). */
  name: string;
  role: SddEntityRole;
  features: SddFeature[];
  hasConstitution: boolean;
  /** mtime (ms) of constitution.md; absent when file is missing or stat fails. */
  constitutionMtime?: number;
}

// ── Mapping ──────────────────────────────────────────────────────────────────

export interface SddMapping {
  /** Absolute path to the service folder. */
  servicePath: string;
  serviceName: string;
  /** Absolute rootPath of the entity this service maps to. */
  entityRootPath: string;
  confidence: 'high' | 'medium' | 'manual';
}

export interface SddMappingPatch {
  servicePath: string;
  /** null = unassign */
  entityRootPath: string | null;
}

// ── Session state ─────────────────────────────────────────────────────────────

export interface SddSessionState {
  entities: SddEntity[];
  mappings: SddMapping[];
  unmappedServices: string[];
  /** rootPaths of entities with no service mapped. */
  unmappedEntities: string[];
  mode: 'auto' | 'off';
  /** rootPath of the entity closest to the current CWD; null when ambiguous. */
  activeEntityRootPath: string | null;
  /** True when scan found entities but specify CLI is not on PATH. */
  cliMissing: boolean;
  /** Depth limit used during the last scan — for the empty-state hint. */
  scannedDepth: number;
  /** Version string from `specify version`, or null when CLI is missing. */
  cliVersion: string | null;
}

// ── Scan result ───────────────────────────────────────────────────────────────

export interface SddScanResult {
  entities: SddEntity[];
  cliMissing: boolean;
  /** The depth limit that was used for this scan — shown in empty-state hint. */
  scannedDepth: number;
  /** Detected version from `specify version`, or null when CLI is missing. */
  cliVersion: string | null;
}
