// See docs/CLAUDE-SYNC.md.

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { loadAllSkills } from '../skills/storage';
import { loadAllAgents } from '../agents/storage';
import { loadAllExtensions } from '../extensions/storage';
import { envLookupFor } from '../extensions/setup';
import { loadExtensionSecrets } from '../extensions/secrets';
import type { LoadedExtension } from '../extensions/types';
import { createLogger } from '../logger';
import type {
  ClaudeSyncGroup,
  ClaudeSyncItem,
  ClaudeSyncPlan,
  ClaudeSyncResult,
} from '../../shared/electron-api';
import { buildPlan, manifestKey, type Desired, type Manifest } from './plan';
import {
  agentFile,
  claudeDirOf,
  existingHash,
  findClaudeCli,
  hashOf,
  hashTree,
  manifestPath,
  readManifest,
  readSnapshot,
  readTree,
  runClaude,
  setSettingsEnv,
  skillDir,
  updateGitExclude,
  writeAtomic,
  writeManifest,
  type Target,
} from './claude-state';
import { projectTargets } from './targets';
import {
  convertAgent,
  convertGuide,
  convertMcp,
  convertSkill,
  resolveForClaude,
  toClaudeName,
  type EnvResolution,
} from './transform';

const log = createLogger('claude-sync');

const SECRET_SKIP = 'needs a secret (turn on "Include secrets" to sync it)';
const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;
const isIconFile = (rel: string): boolean => /^icon\.[a-z0-9]+$/i.test(rel);
const isChange = (action: string): boolean =>
  action === 'add' || action === 'update' || action === 'remove';

type Payload = { files: Map<string, string> } | { text: string };

interface Entry extends Desired {
  payload?: Payload;
}

interface GroupPlan {
  target: Target;
  group: ClaudeSyncGroup;
  entries: Entry[];
  manifest: Manifest;
  savedExcluded: string[];
}

const groupId = (t: Target): string => (t.kind === 'user' ? 'user' : t.root);

function extensionEnv(ext: LoadedExtension): Record<string, EnvResolution> {
  const lookup = envLookupFor(ext.slug);
  return Object.fromEntries(
    Object.entries(ext.config.env ?? {}).map(([key, value]) => [
      key,
      resolveForClaude(value, lookup),
    ]),
  );
}

function collect(target: Target, includeSecrets: boolean, cliFound: boolean): Entry[] {
  const entries: Entry[] = [];
  const cwd = target.kind === 'project' ? target.root : undefined;
  const tier = target.kind === 'project' ? 'project' : 'user';

  for (const skill of loadAllSkills(cwd).filter((s) => s.source === tier)) {
    const converted = convertSkill(skill);
    const files = readTree(skill.path, (rel) => rel === 'SKILL.md' || isIconFile(rel));
    files.set('SKILL.md', converted.content);
    entries.push({
      kind: 'skill',
      name: converted.name,
      source: `Skill · ${skill.metadata.name}`,
      hash: hashTree(files),
      warnings: converted.warnings,
      payload: { files },
    });
  }

  for (const agent of loadAllAgents(cwd).filter((a) => a.source === tier)) {
    const converted = convertAgent(agent);
    entries.push({
      kind: 'agent',
      name: converted.name,
      source: `Agent · ${agent.metadata.name}`,
      hash: hashOf(converted.content),
      warnings: converted.warnings,
      payload: { text: converted.content },
    });
  }

  for (const ext of loadAllExtensions(cwd).filter((e) => e.scope === tier)) {
    const source = `Extension · ${ext.guideFrontmatter.name || ext.config.name}`;
    const disabled = (ext.config as { enabled?: boolean }).enabled === false;
    const env = extensionEnv(ext);

    if (ext.config.mcp) {
      const name = toClaudeName(ext.slug);
      const base = { kind: 'mcp' as const, name, source, warnings: [] };
      const result = convertMcp(ext, env, includeSecrets);
      if (disabled) entries.push({ ...base, skip: 'disabled in MA' });
      else if (!cliFound) entries.push({ ...base, skip: 'Claude Code CLI (`claude`) not found' });
      else if (!result.ok) entries.push({ ...base, skip: result.reason });
      else {
        entries.push({
          ...base,
          hash: hashOf(result.converted.content),
          payload: { text: result.converted.content },
        });
      }
    } else {
      for (const [key, res] of Object.entries(env)) {
        const base = { kind: 'env' as const, name: key, source, warnings: [] };
        if (disabled) entries.push({ ...base, skip: 'disabled in MA' });
        else if (!ENV_KEY.test(key)) entries.push({ ...base, skip: 'not a valid variable name' });
        else if (res.kind === 'missing') {
          entries.push({ ...base, skip: "setup value isn't filled in yet in MA" });
        } else if (res.secret && !includeSecrets) entries.push({ ...base, skip: SECRET_SKIP });
        else entries.push({ ...base, hash: hashOf(res.value), payload: { text: res.value } });
      }
    }

    if (ext.guideBody.trim()) {
      const guide = convertGuide(ext, ext.config.mcp ? [] : Object.keys(env));
      const files = new Map([['SKILL.md', guide.content]]);
      entries.push({
        kind: 'skill',
        name: guide.name,
        source: `${source} (guide)`,
        ...(disabled ? { skip: 'disabled in MA' } : { hash: hashTree(files), payload: { files } }),
        warnings: guide.warnings,
      });
    }
  }

  return entries;
}

function planGroup(
  target: Target,
  label: string,
  includeSecrets: boolean,
  cliFound: boolean,
  excludedOverride?: string[],
): GroupPlan {
  const entries = collect(target, includeSecrets, cliFound);
  const saved = readManifest(target);
  const excluded = excludedOverride ?? saved.excluded;
  const snapshot = readSnapshot(target);
  const items = buildPlan(
    entries,
    saved.entries,
    (kind, name) => existingHash(target, snapshot, kind, name),
    new Set(excluded),
  );
  return {
    target,
    entries,
    manifest: saved.entries,
    savedExcluded: saved.excluded,
    group: {
      id: groupId(target),
      kind: target.kind,
      label,
      claudeDir: claudeDirOf(target),
      excluded,
      items,
    },
  };
}

function plan(
  includeSecrets: boolean,
  excludedOverride?: Record<string, string[]>,
): { plan: ClaudeSyncPlan; groups: GroupPlan[] } {
  const cliPath = findClaudeCli();
  const targets: Array<[Target, string]> = [
    [{ kind: 'user' }, 'You'],
    ...projectTargets().map((p): [Target, string] => [{ kind: 'project', root: p.root }, p.label]),
  ];
  const groups = targets.map(([target, label]) =>
    planGroup(target, label, includeSecrets, cliPath !== null, excludedOverride?.[groupId(target)]),
  );
  const items = groups.flatMap((g) => g.group.items);
  return {
    groups,
    plan: {
      cliPath,
      includeSecrets,
      secretGated: items.filter((i) => i.action === 'skip' && i.reason === SECRET_SKIP).length,
      groups: groups.map((g) => g.group),
    },
  };
}

export function previewSync(
  includeSecrets: boolean,
  excluded?: Record<string, string[]>,
): ClaudeSyncPlan {
  return plan(includeSecrets, excluded).plan;
}

async function applyItem(
  target: Target,
  item: ClaudeSyncItem,
  entry: Entry | undefined,
  cliPath: string | null,
): Promise<void> {
  const removing = item.action === 'remove';
  switch (item.kind) {
    case 'skill': {
      const dir = skillDir(target, item.name);
      rmSync(dir, { recursive: true, force: true });
      if (removing || !entry?.payload || !('files' in entry.payload)) return;
      for (const [rel, text] of entry.payload.files) {
        const file = join(dir, rel);
        mkdirSync(join(file, '..'), { recursive: true });
        writeFileSync(file, text, 'utf8');
      }
      return;
    }
    case 'agent': {
      const file = agentFile(target, item.name);
      if (removing) {
        rmSync(file, { force: true });
        return;
      }
      if (!entry?.payload || !('text' in entry.payload)) return;
      mkdirSync(join(file, '..'), { recursive: true });
      writeAtomic(file, entry.payload.text);
      return;
    }
    case 'mcp': {
      if (!cliPath) throw new Error('Claude Code CLI (`claude`) not found');
      // Local scope keeps a project's servers out of its repo (unlike `.mcp.json`).
      const scope = target.kind === 'user' ? 'user' : 'local';
      const cwd = target.kind === 'project' ? target.root : undefined;
      if (item.action !== 'add') {
        await runClaude(cliPath, ['mcp', 'remove', item.name, '--scope', scope], cwd).catch(
          (err) => {
            if (removing) throw err;
          },
        );
      }
      if (removing || !entry?.payload || !('text' in entry.payload)) return;
      await runClaude(
        cliPath,
        ['mcp', 'add-json', item.name, entry.payload.text, '--scope', scope],
        cwd,
      );
      return;
    }
    case 'env': {
      const value =
        !removing && entry?.payload && 'text' in entry.payload ? entry.payload.text : null;
      setSettingsEnv(target, { [item.name]: value });
      return;
    }
  }
}

/** Repo-relative paths of everything MA wrote into a project's `.claude/`. */
function syncedPaths(root: string, target: Target, manifest: Manifest): string[] {
  const rel = (path: string): string => relative(root, path).split('\\').join('/');
  const paths = [rel(manifestPath(target))];
  let env = false;
  for (const key of Object.keys(manifest)) {
    const [kind, ...rest] = key.split(':');
    const name = rest.join(':');
    if (kind === 'skill') paths.push(`${rel(skillDir(target, name))}/`);
    else if (kind === 'agent') paths.push(rel(agentFile(target, name)));
    else if (kind === 'env') env = true;
  }
  if (env) paths.push(rel(join(claudeDirOf(target), 'settings.local.json')));
  return paths;
}

async function runGroup(
  g: GroupPlan,
  cliPath: string | null,
  failed: ClaudeSyncResult['failed'],
): Promise<void> {
  const byKey = new Map(g.entries.map((e) => [manifestKey(e.kind, e.name), e]));
  const next: Manifest = { ...g.manifest };
  const changes = g.group.items.filter((i) => isChange(i.action));

  for (const item of changes) {
    const entry = byKey.get(item.key);
    try {
      await applyItem(g.target, item, entry, cliPath);
      if (item.action === 'remove') delete next[item.key];
      else if (entry?.hash) next[item.key] = { hash: entry.hash, source: entry.source };
    } catch (err) {
      // The message can echo the MCP JSON, which may carry a secret.
      log.warn(`sync ${item.action} failed for ${item.kind} "${item.name}" in ${g.group.label}`);
      failed.push({
        group: g.group.id,
        kind: item.kind,
        name: item.name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Deleted by hand in Claude and no longer wanted: forget it.
  for (const key of Object.keys(next)) {
    if (!byKey.has(key) && !g.group.items.some((i) => i.key === key)) delete next[key];
  }
  const excluded = g.group.excluded.filter((key) => byKey.has(key));
  const exclusionsChanged =
    [...excluded].sort().join('\n') !== [...g.savedExcluded].sort().join('\n');
  // Don't create a project's `.claude/` just to record that nothing happened.
  if (changes.length === 0 && !exclusionsChanged) return;
  writeManifest(g.target, next, excluded);
  if (g.target.kind === 'project') {
    updateGitExclude(g.target.root, syncedPaths(g.target.root, g.target, next));
  }
}

export async function runSync(
  includeSecrets: boolean,
  excluded: Record<string, string[]>,
): Promise<ClaudeSyncResult> {
  await loadExtensionSecrets();
  const current = plan(includeSecrets, excluded);
  const failed: ClaudeSyncResult['failed'] = [];
  for (const g of current.groups) await runGroup(g, current.plan.cliPath, failed);
  const changed = current.plan.groups.flatMap((g) => g.items).filter((i) => isChange(i.action));
  log.info(`synced to Claude: ${changed.length} change(s), ${failed.length} failed`);
  return { plan: previewSync(includeSecrets), failed };
}
