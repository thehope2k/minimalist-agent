import { join } from 'node:path';
import type { SddEntity, SddMappingPatch, SddSessionState } from './types';
import { autoMap, applyMappingPatch } from './mapper';
import { resolveActiveEntity } from './scan';

/** In-memory store — never written to disk. Cleared on session delete. */
const store = new Map<string, SddSessionState>();

export function getState(sessionId: string): SddSessionState | null {
  return store.get(sessionId) ?? null;
}

export function initState(
  sessionId: string,
  entities: SddEntity[],
  cwd: string,
  mode: 'auto' | 'off',
  cliMissing: boolean,
  scannedDepth = 3,
  cliVersion: string | null = null,
): SddSessionState {
  const { mappings, unmappedServices, unmappedEntities } = autoMap(entities, cwd);
  const activeEntityRootPath = resolveActiveEntity(entities, cwd);
  const state: SddSessionState = {
    entities,
    mappings,
    unmappedServices,
    unmappedEntities,
    mode,
    activeEntityRootPath,
    cliMissing,
    scannedDepth,
    cliVersion,
  };
  store.set(sessionId, state);
  return state;
}

/**
 * Re-initialise state after a file-system triggered re-scan, preserving any
 * confidence='manual' mappings the user set explicitly.
 *
 * Without this, every artifact write by the agent would wipe manual
 * service↔entity assignments made in the UI (BUG-SDD-02 / WEAK-SDD-06).
 */
export function reinitPreservingManual(
  sessionId: string,
  entities: SddEntity[],
  cwd: string,
  mode: 'auto' | 'off',
  cliMissing: boolean,
  scannedDepth = 3,
  cliVersion: string | null = null,
): SddSessionState {
  // Snapshot manual overrides before initState wipes them.
  const manualMappings =
    store.get(sessionId)?.mappings.filter((m) => m.confidence === 'manual') ?? [];

  // Fresh auto-map.
  initState(sessionId, entities, cwd, mode, cliMissing, scannedDepth, cliVersion);

  // Re-apply manual overrides on top of the fresh auto-map.
  for (const manual of manualMappings) {
    const entityStillExists = entities.some((e) => e.rootPath === manual.entityRootPath);
    if (entityStillExists) {
      patchMapping(sessionId, {
        servicePath: manual.servicePath,
        entityRootPath: manual.entityRootPath,
      });
    }
  }

  return store.get(sessionId)!;
}

/**
 * Check whether `absolutePath` lies within a known SDD entity's .specify/
 * directory across ALL active sessions.
 *
 * Used by the sdd:readArtifact and sdd:toggleTaskCheckbox IPC handlers as a
 * defence-in-depth guard against renderer-side logic errors reading or writing
 * arbitrary user files.
 */
export function isPathInKnownEntity(absolutePath: string): boolean {
  // Normalise to forward slashes so the check works on Windows paths too.
  const normalised = absolutePath.replace(/\\/g, '/');
  for (const state of store.values()) {
    for (const entity of state.entities) {
      const base = entity.specifyPath.replace(/\\/g, '/');
      if (normalised === base || normalised.startsWith(base + '/')) {
        return true;
      }
    }
  }
  return false;
}

export function setMode(
  sessionId: string,
  mode: 'auto' | 'off',
): SddSessionState | null {
  const state = store.get(sessionId);
  if (!state) return null;
  state.mode = mode;
  store.set(sessionId, state);
  return state;
}

export function patchMapping(
  sessionId: string,
  patch: SddMappingPatch,
): SddSessionState | null {
  const state = store.get(sessionId);
  if (!state) return null;

  // Remember the entity that was previously mapped to this service (if any),
  // so we can restore it to unmappedEntities if it becomes unassigned.
  const previousMapping = state.mappings.find((m) => m.servicePath === patch.servicePath);

  state.mappings = applyMappingPatch(state.mappings, patch, state.entities);

  const mappedServicePaths = new Set(state.mappings.map((m) => m.servicePath));
  const mappedEntityRoots = new Set(state.mappings.map((m) => m.entityRootPath));

  if (patch.entityRootPath === null) {
    // Un-assigning: restore the service path to the unmapped list.
    if (!state.unmappedServices.includes(patch.servicePath)) {
      state.unmappedServices.push(patch.servicePath);
    }
  } else {
    // Assigning: remove the service from the unmapped list.
    state.unmappedServices = state.unmappedServices.filter(
      (s) => s !== patch.servicePath,
    );
    // Remove the newly assigned entity from unmappedEntities.
    state.unmappedEntities = state.unmappedEntities.filter(
      (e) => e !== patch.entityRootPath,
    );
  }

  // If the previously mapped entity is now free (no other mapping uses it),
  // restore it to unmappedEntities.
  if (previousMapping && !mappedEntityRoots.has(previousMapping.entityRootPath)) {
    if (!state.unmappedEntities.includes(previousMapping.entityRootPath)) {
      state.unmappedEntities.push(previousMapping.entityRootPath);
    }
  }

  // Keep unmappedServices in sync: remove any that are now mapped.
  state.unmappedServices = state.unmappedServices.filter(
    (s) => !mappedServicePaths.has(s),
  );

  store.set(sessionId, state);
  return state;
}

export function clearState(sessionId: string): void {
  store.delete(sessionId);
}

export function clearAll(): void {
  store.clear();
}
