/**
 * Normalise a folder name for heuristic comparison.
 * Single source of truth — imported by scan.ts (role inference) and mapper.ts
 * (auto-mapping). Do NOT duplicate this function in other modules.
 */
export function normalise(name: string): string {
  return name
    .toLowerCase()
    .replace(/^[\d-]+/, '')                       // strip leading digits/dashes
    .replace(/^(speckit|spec|specs)-?/, '')       // strip speckit- prefix
    .replace(/-(speckit|spec|specs)$/, '')         // strip -spec suffix
    .replace(/[^a-z0-9]/g, '');                   // only alphanumeric
}
