import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { LoadedAgent } from './types';
import { parseAgentFile } from './parse';
import { Paths, projectConfigRoot } from '../storage/paths';
import { invalidateAgentsPromptCache } from '../agent-runtime/system-prompt';
import { findIconFile } from '../asset-tiers/icon';
import { createTwoTierCache, mergeTiers } from '../asset-tiers/two-tier-cache';
import { scanAssetDirectory } from '../asset-tiers/file-tree';

/* ---------- directory resolution ---------- */

/** User-tier agents directory: ~/.minimalist-agent/agents/ */
export function getAgentsDir(): string {
  return Paths.agentsDir();
}

/**
 * Project-tier agents directory: <cwd>/.minimalist-agent/agents/
 * Git-committable, team-shareable.
 */
export function getProjectAgentsDir(cwd: string): string {
  return join(projectConfigRoot(cwd), 'agents');
}

/* ---------- single-agent loader ---------- */

function loadAgentFromDir(slug: string, dir: string, source: import('./types').AgentSource): LoadedAgent | null {
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
    source,
  };
}

/* ---------- cache ---------- */

const cache = createTwoTierCache<LoadedAgent>(5 * 60_000);

/** Drop the cache. Call on file events / settings changes. */
export function invalidateAgentsCache(cwd?: string): void {
  cache.invalidate(cwd);
  invalidateAgentsPromptCache(); // Also invalidate system prompt cache
}

/* ---------- directory-level loader ---------- */

function loadAgentsFromDirectory(
  dir: string,
  source: import('./types').AgentSource,
): LoadedAgent[] {
  if (!existsSync(dir)) return [];
  const agents: LoadedAgent[] = [];
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  for (const name of entries) {
    const agent = loadAgentFromDir(name, dir, source);
    if (agent) agents.push(agent);
  }
  return agents;
}

/* ---------- public API ---------- */

/**
 * Load all agents merged from all available tiers:
 *   - user tier:    ~/.minimalist-agent/agents/
 *   - project tier: <cwd>/.minimalist-agent/agents/  (when cwd is provided)
 *
 * Project-tier agents take precedence over user-tier for same slug.
 * Cached per unique (user + cwd) combination with a 5-minute TTL.
 */
export function loadAllAgents(cwd?: string): LoadedAgent[] {
  const cached = cache.get(cwd);
  if (cached) return cached;

  const userAgents = loadAgentsFromDirectory(getAgentsDir(), 'user');
  const projectAgents = cwd
    ? loadAgentsFromDirectory(getProjectAgentsDir(cwd), 'project')
    : [];

  const agents = mergeTiers(userAgents, projectAgents);
  cache.set(cwd, agents);
  return agents;
}

/** O(1) lookup by slug, checking project tier first then user tier. */
export function loadAgentBySlug(slug: string, cwd?: string): LoadedAgent | null {
  if (cwd) {
    const proj = loadAgentFromDir(slug, getProjectAgentsDir(cwd), 'project');
    if (proj) return proj;
  }
  return loadAgentFromDir(slug, getAgentsDir(), 'user');
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
  return scanAssetDirectory(dir);
}

export type { LoadedAgent } from './types';
export { basename };
