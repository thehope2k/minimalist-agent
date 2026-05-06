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
}
