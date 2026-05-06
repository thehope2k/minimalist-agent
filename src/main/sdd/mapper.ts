import { basename, join } from 'node:path';
import type { SddEntity, SddMapping, SddMappingPatch } from './types';
import { readdirSync } from 'node:fs';
import { normalise } from './utils';

export interface AutoMapResult {
  mappings: SddMapping[];
  unmappedServices: string[];
  unmappedEntities: string[];
}

/**
 * Auto-map discovered entities to service folders.
 *
 * HIGH confidence: entity.rootPath is a direct child of cwd that contains
 *   non-.specify/ content (code lives there) → entity maps to itself.
 * MEDIUM confidence: entity folder name ≈ a sibling folder's name after
 *   normalisation (e.g. "speckit-service-b" ↔ "service-b").
 * Single-entity shortcut: if only one entity, no mapping table needed —
 *   return empty mappings (caller treats it as root).
 */
export function autoMap(entities: SddEntity[], cwd: string): AutoMapResult {
  if (entities.length === 0) {
    return { mappings: [], unmappedServices: [], unmappedEntities: [] };
  }

  // Single-entity shortcut — skip mapping UI entirely.
  if (entities.length === 1) {
    return { mappings: [], unmappedServices: [], unmappedEntities: [] };
  }

  // Gather sibling directories under cwd (potential service folders).
  let siblings: string[] = [];
  try {
    siblings = readdirSync(cwd, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name !== '.specify')
      .map((e) => e.name);
  } catch { /* empty */ }

  const mappings: SddMapping[] = [];
  const mappedEntityRoots = new Set<string>();
  const mappedServices = new Set<string>();

  // HIGH confidence pass: embedded entities (code + .specify in same folder).
  for (const entity of entities) {
    if (entity.role === 'embedded' || entity.role === 'standalone') {
      const svcName = basename(entity.rootPath);
      if (!mappedEntityRoots.has(entity.rootPath) && !mappedServices.has(entity.rootPath)) {
        mappings.push({
          servicePath: entity.rootPath,
          serviceName: svcName,
          entityRootPath: entity.rootPath,
          confidence: 'high',
        });
        mappedEntityRoots.add(entity.rootPath);
        mappedServices.add(entity.rootPath);
      }
    }
  }

  // MEDIUM confidence pass: name-similarity between entity folder and sibling service.
  for (const entity of entities) {
    if (mappedEntityRoots.has(entity.rootPath)) continue;
    const normEntity = normalise(basename(entity.rootPath));
    for (const sib of siblings) {
      const sibPath = join(cwd, sib);
      if (mappedServices.has(sibPath)) continue;
      const normSib = normalise(sib);
      if (
        normEntity.length > 0 &&
        normSib.length > 0 &&
        (normEntity.includes(normSib) || normSib.includes(normEntity))
      ) {
        mappings.push({
          servicePath: sibPath,
          serviceName: sib,
          entityRootPath: entity.rootPath,
          confidence: 'medium',
        });
        mappedEntityRoots.add(entity.rootPath);
        mappedServices.add(sibPath);
        break;
      }
    }
  }

  const unmappedEntities = entities
    .filter((e) => !mappedEntityRoots.has(e.rootPath))
    .map((e) => e.rootPath);

  const unmappedServices = siblings
    .map((s) => join(cwd, s))
    .filter((sp) => !mappedServices.has(sp));

  return { mappings, unmappedServices, unmappedEntities };
}

/**
 * Apply a patch to an existing mapping array.
 * entityRootPath = null → removes the mapping for that service.
 */
export function applyMappingPatch(
  mappings: SddMapping[],
  patch: SddMappingPatch,
  entities: SddEntity[],
): SddMapping[] {
  const updated = mappings.filter((m) => m.servicePath !== patch.servicePath);
  if (patch.entityRootPath !== null) {
    const entity = entities.find((e) => e.rootPath === patch.entityRootPath);
    // Guard: silently drop the patch if the target entity is no longer known.
    if (!entity) return updated;
    updated.push({
      servicePath: patch.servicePath,
      serviceName: basename(patch.servicePath),
      entityRootPath: patch.entityRootPath,
      confidence: 'manual',
    });
  }
  return updated;
}
