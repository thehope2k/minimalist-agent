import {existsSync, readdirSync, readFileSync, rmSync, statSync} from 'node:fs';
import {basename, join} from 'node:path';
import type {LoadedAgent} from './types';
import {parseAgentFile} from './parse';
import {Paths} from '../storage/paths';
import {invalidateAgentsPromptCache} from '../agent/system-prompt';

/* ---------- directory resolution ---------- */

/** Agents directory — lives under the app's `userData` root, alongside skills/extensions. */
export function getAgentsDir(): string {
  return Paths.agentsDir();
}

/* ---------- icon discovery ---------- */

const ICON_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif'];

/** Find the first `icon.{ext}` file in an agent directory, if any. */
function findIconFile(agentDir: string): string | undefined {
  for (const ext of ICON_EXTS) {
    const candidate = join(agentDir, `icon${ext}`);
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

/* ---------- single-agent loader ---------- */

function loadAgentFromDir(slug: string, dir: string): LoadedAgent | null {
  const agentDir = join(dir, slug);
  const agentFile = join(agentDir, 'AGENT.md');

  try {
    if (!existsSync(agentDir) || !statSync(agentDir).isDirectory()) return null;
  } catch {
    return null;
  }
  if (!existsSync(agentFile)) return null;

  let content: string;
  try {
    content = readFileSync(agentFile, 'utf-8');
  } catch {
    return null;
  }

  const parsed = parseAgentFile(content);
  if (!parsed) return null;

  return {
    slug,
    metadata: parsed.metadata,
    content: parsed.body,
    iconPath: findIconFile(agentDir),
    path: agentDir,
  };
}

/* ---------- cache ---------- */

interface CacheEntry {
  agents: LoadedAgent[];
  ts: number;
}

let cache: CacheEntry | null = null;
const CACHE_TTL = 5 * 60_000; // 5 minutes

/** Drop the cache. Call on file events / settings changes. */
export function invalidateAgentsCache(): void {
  cache = null;
  invalidateAgentsPromptCache(); // Also invalidate system prompt cache
}

/* ---------- public API ---------- */

/**
 * Load every agent under `~/.agents/agents/`.
 * Cached for `CACHE_TTL`.
 */
export function loadAllAgents(): LoadedAgent[] {
  const now = Date.now();
  if (cache && now - cache.ts < CACHE_TTL) return cache.agents;

  const dir = getAgentsDir();
  if (!existsSync(dir)) {
    const result = { agents: [], ts: now };
    cache = result;
    return result.agents;
  }

  const agents: LoadedAgent[] = [];
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    /* ignore */
  }
  for (const name of entries) {
    const agent = loadAgentFromDir(name, dir);
    if (agent) agents.push(agent);
  }

  cache = {agents, ts: now};
  return agents;
}

/** O(1) lookup by slug. */
export function loadAgentBySlug(slug: string): LoadedAgent | null {
  return loadAgentFromDir(slug, getAgentsDir());
}

/** Delete an agent directory. Returns true if it existed and was removed. */
export function deleteAgent(slug: string): boolean {
  const agentDir = join(getAgentsDir(), slug);
  if (!existsSync(agentDir)) return false;
  try {
    rmSync(agentDir, { recursive: true });
    invalidateAgentsCache();
    return true;
  } catch {
    return false;
  }
}

/* ---------- file tree (for info pages) ---------- */

export type AgentFileNode =
  | { kind: 'file'; name: string; path: string; size: number }
  | { kind: 'dir'; name: string; path: string; children: AgentFileNode[] };

/** Recursively scan an agent directory for the info-page file tree view. */
export function scanAgentDirectory(dir: string): AgentFileNode[] {
  if (!existsSync(dir)) return [];
  const out: AgentFileNode[] = [];
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  for (const name of names) {
    if (name.startsWith('.')) continue;
    const full = join(dir, name);
    let info;
    try {
      info = statSync(full);
    } catch {
      continue;
    }
    if (info.isDirectory()) {
      out.push({
        kind: 'dir',
        name,
        path: full,
        children: scanAgentDirectory(full),
      });
    } else if (info.isFile()) {
      out.push({ kind: 'file', name, path: full, size: info.size });
    }
  }
  out.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return out;
}

export type { LoadedAgent } from './types';
export { basename };
