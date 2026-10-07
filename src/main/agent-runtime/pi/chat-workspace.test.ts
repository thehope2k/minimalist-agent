import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ensureSessionScratchDir,
  resolveChatWorkingDirectory,
  sessionScratchDir,
} from './chat-workspace';

const sessionDirs: string[] = [];

afterEach(() => {
  for (const sessionDir of sessionDirs.splice(0)) {
    rmSync(sessionDir, { recursive: true, force: true });
  }
});

describe('chat workspace', () => {
  it('keeps an explicitly selected working directory', () => {
    const sessionDir = mkdtempSync(join(tmpdir(), 'minimalist-agent-session-'));
    sessionDirs.push(sessionDir);
    const projectDir = join(sessionDir, 'project');

    expect(resolveChatWorkingDirectory(projectDir, sessionDir)).toBe(projectDir);
  });

  it('uses and creates the session scratch directory without a selected folder', () => {
    const sessionDir = mkdtempSync(join(tmpdir(), 'minimalist-agent-session-'));
    sessionDirs.push(sessionDir);
    const scratchDir = sessionScratchDir(sessionDir);

    ensureSessionScratchDir(sessionDir);

    expect(resolveChatWorkingDirectory(undefined, sessionDir)).toBe(scratchDir);
    expect(existsSync(scratchDir)).toBe(true);
  });
});
