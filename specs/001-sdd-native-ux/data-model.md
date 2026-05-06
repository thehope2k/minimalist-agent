# Data Model: SDD Native UX

## Core Types (src/main/sdd/types.ts)

```typescript
/** A discovered .specify/ directory in the workspace. */
export interface SddEntity {
  /** Absolute path to the .specify/ directory. */
  specifyPath: string;
  /** Absolute path to the parent directory containing .specify/. */
  rootPath: string;
  /** Display name (last segment of rootPath). */
  name: string;
  /** Inferred role based on location and content. */
  role: 'embedded' | 'paired' | 'standalone' | 'shared';
  /** All discovered features under .specify/specs/. */
  features: SddFeature[];
  /** Existence of .specify/memory/constitution.md. */
  hasConstitution: boolean;
}

/** A single feature directory under .specify/specs/NNN-name/. */
export interface SddFeature {
  /** Absolute path to the feature directory. */
  path: string;
  /** Directory name, e.g. "001-dark-mode". */
  name: string;
  /** Sequential number prefix, e.g. "001". */
  number: string;
  /** Human-readable name without number prefix, e.g. "dark-mode". */
  slug: string;
  /** Artifact presence flags. */
  artifacts: SddArtifactSet;
  /** Derived phase from artifact state. */
  currentPhase: SddPhase;
}

/** Which canonical artifact files exist for a feature. */
export interface SddArtifactSet {
  hasSpec: boolean;
  hasPlan: boolean;
  hasTasks: boolean;
  /** True when tasks.md exists AND at least one [x] checkbox found. */
  hasImplementation: boolean;
  /** Ratio 0–1 of checked tasks to total tasks. -1 if no tasks.md. */
  taskCompletionRatio: number;
}

/** The canonical SDD phase derived from artifact presence. */
export type SddPhase =
  | 'constitution'   // no constitution.md
  | 'specify'        // constitution exists, no spec
  | 'plan'           // spec exists, no plan
  | 'tasks'          // plan exists, no tasks
  | 'implement'      // tasks exist, not all checked
  | 'complete';      // all tasks checked (or tasks exist and ratio = 1)

/** Mapping from a service folder to a SpecKit entity. */
export interface SddMapping {
  /** Absolute path to the service folder. */
  servicePath: string;
  /** Display name of the service folder. */
  serviceName: string;
  /** Absolute path to the entity's rootPath it maps to. */
  entityRootPath: string;
  /** How this mapping was established. */
  confidence: 'high' | 'medium' | 'manual';
}

/** The full session-scoped SDD state. */
export interface SddSessionState {
  /** All discovered entities for this session's CWD. */
  entities: SddEntity[];
  /** Current mapping table. */
  mappings: SddMapping[];
  /** Service folders found with no entity mapping. */
  unmappedServices: string[];
  /** Entities with no service mapped to them. */
  unmappedEntities: string[];  // rootPaths
  /** SDD mode for this session. */
  mode: 'auto' | 'off';
  /** The entity active for the current CWD (closest ancestor match). */
  activeEntityRootPath: string | null;
}

/** Partial update to a single mapping entry. */
export interface SddMappingPatch {
  servicePath: string;
  entityRootPath: string | null;  // null = unassign
}
```

## Session Storage Extension

```typescript
// sessions.ts — SessionMeta gains one new optional field:
sddMode?: 'auto' | 'off';
// Default when absent: 'auto' (backward compatible with existing sessions)
```

## Renderer-Side Types (src/renderer/src/lib/sdd.ts)

```typescript
// Re-exports the shared types above (imported via window.api types)
// Plus renderer helpers:

export function phaseLabel(phase: SddPhase): string { ... }
export function phaseNext(phase: SddPhase): string { ... }
export function artifactBadges(artifacts: SddArtifactSet): ArtifactBadge[] { ... }

export interface ArtifactBadge {
  label: 'spec' | 'plan' | 'tasks' | 'impl';
  done: boolean;
  tooltip: string;
}
```

## Phase Derivation Logic (src/main/sdd/phase.ts)

```
hasConstitution=false                    → 'constitution'
hasConstitution=true, hasSpec=false      → 'specify'
hasSpec=true, hasPlan=false              → 'plan'
hasPlan=true, hasTasks=false             → 'tasks'
hasTasks=true, taskCompletionRatio < 1   → 'implement'
hasTasks=true, taskCompletionRatio = 1   → 'complete'
```

Phase is derived per-feature (the feature with the lowest phase drives the entity's displayed phase).

## Entity Role Inference (src/main/sdd/scan.ts)

```
scanDepth = 0 (entity at CWD root):
  → role = 'standalone'  (CWD is a pure spec repo)

entity.rootPath is a direct child of CWD AND rootPath contains non-spec files:
  → role = 'embedded'  (code + specs co-located)

entity.rootPath is a direct child of CWD AND rootPath contains ONLY .specify/:
  → role = 'standalone' OR 'paired' (check name similarity to sibling dirs)

entity.rootPath === CWD (depth 0, CWD has other dirs):
  → role = 'shared'  (root-level, cross-service umbrella)
```

## Auto-Mapping Heuristics (src/main/sdd/mapper.ts)

```
For each entity:
  HIGH confidence:
    entity.rootPath is a direct child folder of CWD that also contains
    non-.specify/ content (code files exist) → maps entity to itself

  MEDIUM confidence (name similarity):
    Normalise both names: lowercase, strip leading digits, strip
    "speckit-", "spec-", "-spec", "-specs" prefixes/suffixes
    If normalised(entity.name) contains normalised(sibling.name) or vice versa
    → suggest entity ↔ sibling mapping

  Single entity shortcut:
    If only ONE entity found total → skip mapping UI, treat as root for all
```
