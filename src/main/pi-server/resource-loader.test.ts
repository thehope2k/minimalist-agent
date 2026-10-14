import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SettingsManager, type InlineExtension } from '@earendil-works/pi-coding-agent';
import { createIsolatedResourceLoader } from './resource-loader';

const SKILL_MD = '---\nname: leaked\ndescription: leaked skill\n---\nbody';

let root: string;
let cwd: string;
let agentDir: string;

function write(path: string, content: string): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ma-loader-'));
  cwd = join(root, 'project');
  agentDir = join(root, 'agent');
  mkdirSync(cwd, { recursive: true });
  mkdirSync(agentDir, { recursive: true });
  write(join(cwd, 'AGENTS.md'), 'project context');
  write(join(agentDir, 'AGENTS.md'), 'global context');
  write(join(cwd, '.pi', 'skills', 'leaked', 'SKILL.md'), SKILL_MD);
  write(join(agentDir, 'skills', 'leaked', 'SKILL.md'), SKILL_MD);
  write(join(agentDir, 'SYSTEM.md'), 'pi-cli system prompt');
  write(join(agentDir, 'APPEND_SYSTEM.md'), 'pi-cli append');
  write(join(agentDir, 'extensions', 'rogue.ts'), 'throw new Error("must not load");');
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

function build(extra: Partial<Parameters<typeof createIsolatedResourceLoader>[0]> = {}) {
  return createIsolatedResourceLoader({
    cwd,
    agentDir,
    settingsManager: SettingsManager.inMemory(),
    ...extra,
  });
}

describe('createIsolatedResourceLoader', () => {
  it('ignores pi-native context files, skills, and prompt files', async () => {
    const loader = build();
    await loader.reload();

    expect(loader.getAgentsFiles().agentsFiles).toEqual([]);
    expect(loader.getSkills().skills).toEqual([]);
    expect(loader.getSystemPrompt()).toBeUndefined();
    expect(loader.getAppendSystemPrompt()).toEqual([]);
  });

  it('does not execute extensions discovered on disk', async () => {
    const loader = build();
    await loader.reload();

    const { extensions, errors } = loader.getExtensions();
    expect(extensions).toEqual([]);
    expect(errors).toEqual([]);
  });

  it('still loads inline extension factories', async () => {
    const inline: InlineExtension = { name: 'ma-inline', factory: () => {} };
    const loader = build({ extensionFactories: [inline] });
    await loader.reload();

    expect(loader.getExtensions().extensions.map((e) => e.path)).toEqual(['<inline:ma-inline>']);
  });

  it('honours the explicit system prompt and the live append array', async () => {
    const append = ['turn one'];
    const loader = build({ systemPrompt: 'task prompt', appendSystemPrompt: append });
    await loader.reload();
    expect(loader.getSystemPrompt()).toBe('task prompt');
    expect(loader.getAppendSystemPrompt()).toEqual(['turn one']);

    append[0] = 'turn two';
    await loader.reload();
    expect(loader.getAppendSystemPrompt()).toEqual(['turn two']);
  });
});
