import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionManager } from '@earendil-works/pi-coding-agent';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionMeta, StoredMessage } from './session-types';

const paths = vi.hoisted(() => ({ root: '' }));
vi.mock('./paths', () => ({
  Paths: { sessionsDir: () => paths.root },
  MIGRATION_BACKUP_RETENTION: 3,
}));
vi.mock('../auth/resolve', () => ({ resolveAuthForSlug: vi.fn() }));
vi.mock('./connections', () => ({ listConnections: () => [] }));

import * as fork from './session-fork';
import { persistSessionBranch } from './session-branch';

const forkSpy = vi.spyOn(fork, 'forkSessionTranscript');

const PARENT = 'parentid1';
const CHILD = 'childid1';
const CWD = '/work/project';

function userMessage(id: string, content: string, createdAt: number): StoredMessage {
  return { id, role: 'user', content, createdAt };
}

function seedParentTranscript(parentDir: string): { runtimeSessionId: string; times: number[] } {
  const manager = SessionManager.create(CWD, parentDir);
  const scratchPath = join(parentDir, 'scratch', 'ro.py');
  manager.appendMessage({
    role: 'user',
    content: [{ type: 'text', text: 'first' }],
    timestamp: Date.now(),
  });
  manager.appendMessage({
    role: 'assistant',
    content: [{ type: 'text', text: `wrote ${scratchPath}` }],
  } as never);
  manager.appendMessage({
    role: 'user',
    content: [{ type: 'text', text: 'second' }],
    timestamp: Date.now(),
  });
  manager.appendMessage({ role: 'assistant', content: [{ type: 'text', text: 'done' }] } as never);
  const times = manager.getEntries().map((entry) => Date.parse(entry.timestamp));
  return { runtimeSessionId: manager.getSessionId(), times };
}

let parentMeta: SessionMeta;
let messages: StoredMessage[];

beforeEach(() => {
  paths.root = mkdtempSync(join(tmpdir(), 'branch-'));
  const parentDir = join(paths.root, PARENT);
  mkdirSync(join(parentDir, 'scratch'), { recursive: true });
  mkdirSync(join(parentDir, 'attachments'));
  writeFileSync(join(parentDir, 'scratch', 'ro.py'), 'print(1)');
  writeFileSync(join(parentDir, 'attachments', 'a.png'), 'png');
  mkdirSync(join(paths.root, CHILD));

  const { runtimeSessionId, times } = seedParentTranscript(parentDir);
  parentMeta = {
    id: PARENT,
    title: 'Parent',
    archived: false,
    createdAt: 1,
    lastMessageAt: 2,
    workingDirectory: CWD,
    runtimeSessionId,
    autonomyLevel: 80,
    thinkingLevel: 'medium',
    pinnedAssets: ['user:x'],
    activatedExtensions: ['epam-kb'],
    permissionMode: 'auto',
    model: 'm',
    connectionSlug: 'c',
  };
  messages = [
    userMessage('m1', 'first', times[0]!),
    userMessage('m2', `see ${parentDir}/scratch/ro.py`, times[1]!),
    userMessage('m3', 'second', times[2]! + 2_000),
  ];
});

afterEach(() => rmSync(paths.root, { recursive: true, force: true }));

const branch = () =>
  persistSessionBranch({
    parentId: PARENT,
    parent: { meta: parentMeta, messages },
    cutIndex: 2,
    id: CHILD,
  });

describe('persistSessionBranch', () => {
  it('carries session settings over to the branch', async () => {
    const { meta } = await branch();

    expect(meta).toMatchObject({
      autonomyLevel: 80,
      thinkingLevel: 'medium',
      pinnedAssets: ['user:x'],
      activatedExtensions: ['epam-kb'],
    });
  });

  it('copies scratch and attachments so the branch is self-contained', async () => {
    await branch();

    expect(readFileSync(join(paths.root, CHILD, 'scratch', 'ro.py'), 'utf-8')).toBe('print(1)');
    expect(existsSync(join(paths.root, CHILD, 'attachments', 'a.png'))).toBe(true);
  });

  it('retargets stored messages at the branch', async () => {
    await branch();

    const stored = readFileSync(join(paths.root, CHILD, 'messages.jsonl'), 'utf-8');
    expect(stored).toContain(`${CHILD}/scratch/ro.py`);
    expect(stored).not.toContain(PARENT);
  });

  it('forks the agent transcript before the divergence message and retargets it', async () => {
    const { meta, warnings } = await branch();

    const file = readdirSync(join(paths.root, CHILD)).find(
      (name) => name.endsWith('.jsonl') && name !== 'messages.jsonl',
    );
    const transcript = readFileSync(join(paths.root, CHILD, file!), 'utf-8');
    expect(warnings).toEqual([]);
    expect(meta.runtimeSessionId).toBeDefined();
    expect(file).toContain(meta.runtimeSessionId!);
    expect(transcript).toContain(`${CHILD}/scratch/ro.py`);
    expect(transcript).not.toContain('"second"');
    expect(transcript).toContain('wrote');
  });

  it('warns when the parent has no agent transcript', async () => {
    parentMeta.runtimeSessionId = 'missing';

    const { warnings } = await branch();

    expect(warnings).toEqual([expect.stringContaining('No agent transcript')]);
  });

  it('warns when summarized branching is requested but unavailable', async () => {
    const { warnings } = await persistSessionBranch({
      parentId: PARENT,
      parent: { meta: parentMeta, messages },
      cutIndex: 2,
      id: CHILD,
      options: { withContext: true },
    });

    expect(warnings).toEqual([expect.stringContaining('Summarized branching is unavailable')]);
  });

  it('resumes through Pi discovery with the parent working directory', async () => {
    await branch();

    const resumed = SessionManager.continueRecent(CWD, join(paths.root, CHILD));

    expect(resumed.getEntries().length).toBeGreaterThan(0);
  });

  it('does not alias the parent’s arrays', async () => {
    const { meta } = await branch();

    expect(meta.pinnedAssets).toEqual(parentMeta.pinnedAssets);
    expect(meta.pinnedAssets).not.toBe(parentMeta.pinnedAssets);
    expect(meta.activatedExtensions).not.toBe(parentMeta.activatedExtensions);
  });

  it('leaves a listable session.json behind from the start', async () => {
    let metaExistedDuringFork = false;
    forkSpy.mockImplementationOnce(async () => {
      metaExistedDuringFork = existsSync(join(paths.root, CHILD, 'session.json'));
      return { outcome: 'no-transcript' };
    });

    await branch();

    expect(metaExistedDuringFork).toBe(true);
  });

  it('removes the partial branch directory when branching throws', async () => {
    forkSpy.mockRejectedValueOnce(new Error('boom'));

    await expect(branch()).rejects.toThrow('boom');

    expect(existsSync(join(paths.root, CHILD))).toBe(false);
    expect(existsSync(join(paths.root, PARENT))).toBe(true);
  });

  it('warns when the cut point was only approximate', async () => {
    messages[2] = userMessage('m3', 'unrecorded text', messages[2]!.createdAt + 5 * 60_000);

    const { warnings } = await branch();

    expect(warnings).toEqual([expect.stringContaining('off by a turn')]);
  });
});
