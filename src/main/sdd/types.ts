import type { FSWatcher } from 'node:fs';

// Re-export all shared types (used by both main and renderer).
export type {
  SddPhase,
  SddArtifactSet,
  SddFeature,
  SddEntityRole,
  SddEntity,
  SddMapping,
  SddMappingPatch,
  SddSessionState,
  SddScanResult,
} from '../../shared/sdd-types';

// ── Watcher handle (internal, main-process only) ──────────────────────────────

export interface SddWatchHandle {
  /** All active FSWatcher instances for this entity (one per watched directory on Linux). */
  watchers: FSWatcher[];
  entityRootPath: string;
  /**
   * Absolute paths currently being watched for this entity.
   * Used to detect when a new directory (e.g. specs/) is created after the
   * initial watch was set up, so we can add a watcher for it.
   */
  watchedPaths: Set<string>;
}
