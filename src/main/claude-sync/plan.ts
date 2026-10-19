import type { ClaudeSyncItem, ClaudeSyncKind } from '../../shared/electron-api';

export interface Desired {
  kind: ClaudeSyncKind;
  name: string;
  source: string;
  hash?: string;
  warnings: string[];
  skip?: string;
}

export interface ManifestEntry {
  hash: string;
  source: string;
}

export type Manifest = Record<string, ManifestEntry>;

/** undefined = absent in Claude; '' = present but not comparable (MCP servers). */
export type ExistingHash = (kind: ClaudeSyncKind, name: string) => string | undefined;

export const manifestKey = (kind: ClaudeSyncKind, name: string): string => `${kind}:${name}`;

const KIND_LABEL: Record<ClaudeSyncKind, string> = {
  skill: 'skill',
  agent: 'agent',
  mcp: 'MCP server',
  env: 'environment variable',
};

export function buildPlan(
  desired: Desired[],
  manifest: Manifest,
  existing: ExistingHash,
  excluded: ReadonlySet<string> = new Set(),
): ClaudeSyncItem[] {
  const items: ClaudeSyncItem[] = [];
  const claimed = new Set<string>();

  for (const d of desired) {
    const key = manifestKey(d.kind, d.name);
    const base = {
      key,
      kind: d.kind,
      name: d.name,
      source: d.source,
      warnings: d.warnings,
      selectable: true,
      excluded: false,
    };
    const skip = (reason: string): ClaudeSyncItem => ({
      ...base,
      selectable: false,
      action: 'skip',
      reason,
    });
    if (claimed.has(key)) {
      items.push(skip(`another MA item already syncs as "${d.name}"`));
      continue;
    }
    claimed.add(key);
    const owned = manifest[key];
    const current = existing(d.kind, d.name);

    if (excluded.has(key)) {
      // Excluding something MA already put in Claude takes it back out.
      items.push(
        owned && current !== undefined
          ? { ...base, excluded: true, action: 'remove', reason: 'excluded by you' }
          : { ...base, excluded: true, action: 'excluded' },
      );
      continue;
    }
    if (d.skip || d.hash === undefined) {
      // A skipped entry MA synced before is left in place rather than torn
      // down — e.g. secrets turned off for this run shouldn't delete a server.
      items.push(skip(d.skip ?? 'nothing to sync'));
      continue;
    }
    if (current !== undefined && !owned) {
      items.push(
        skip(
          `a Claude ${KIND_LABEL[d.kind]} named "${d.name}" already exists and wasn't created by MA`,
        ),
      );
      continue;
    }
    if (current === undefined) {
      items.push({ ...base, action: 'add' });
      continue;
    }
    const editedInClaude = current !== '' && current !== owned.hash;
    if (d.hash === owned.hash && !editedInClaude) {
      items.push({ ...base, action: 'unchanged' });
      continue;
    }
    items.push({
      ...base,
      action: 'update',
      warnings: editedInClaude
        ? [...d.warnings, 'edited in Claude since the last sync — those edits will be replaced']
        : d.warnings,
    });
  }

  for (const [key, entry] of Object.entries(manifest)) {
    if (claimed.has(key)) continue;
    const [kind, ...rest] = key.split(':');
    const name = rest.join(':');
    if (existing(kind as ClaudeSyncKind, name) === undefined) continue;
    items.push({
      key,
      kind: kind as ClaudeSyncKind,
      name,
      source: entry.source,
      action: 'remove',
      reason: 'no longer in MA',
      warnings: [],
      selectable: false,
      excluded: false,
    });
  }

  return items;
}
