import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  GitCommitFailure,
  GitCommitFailureKind,
  GitCommitFailurePhase,
  GitCommitPreflightResult,
  GitCommitRequest,
  GitCommitResult,
} from '../../shared/electron-api';
import {
  assertHasStagedChanges,
  assertIndexIsResolved,
  createTemporaryIndex,
  readHead,
  reconcileRealIndex,
  removeTemporaryIndex,
  stageCommitFiles,
  type TemporaryIndex,
} from './commit-index';
import { normalizeProcessFailure } from './process-error';
import { runCancellableGit } from './cancellable-git';
import { hasWorkingTreeChanged, tryCaptureWorkingTree } from './working-tree-fingerprint';

const execFileAsync = promisify(execFile);
const GIT_QUERY_TIMEOUT_MS = 30_000;
const COMMIT_TIMEOUT_MS = 5 * 60_000;
const MAX_COMMIT_OUTPUT_BYTES = 10 * 1024 * 1024;

function classifyFailure(
  phase: GitCommitFailurePhase,
  diagnostics: ReturnType<typeof normalizeProcessFailure>,
): { kind: GitCommitFailureKind; summary: string } {
  // Hook output shares git's stderr, so text matching is only trusted before hooks run.
  const output = phase === 'commit' ? '' : `${diagnostics.stderr}\n${diagnostics.stdout}`;
  if (diagnostics.cancelled) return { kind: 'cancelled', summary: 'Commit cancelled' };
  if (diagnostics.outputTooLarge) {
    return { kind: 'output-too-large', summary: 'Commit checks produced too much output' };
  }
  if (diagnostics.timedOut) return { kind: 'timeout', summary: 'Commit timed out' };
  if (/unresolved conflicts/i.test(output)) {
    return { kind: 'unmerged-index', summary: 'Resolve conflicts before committing' };
  }
  if (/user\.email|user\.name|author identity unknown|please tell me who you are/i.test(output)) {
    return { kind: 'git-config', summary: 'Git author identity is not configured' };
  }
  if (/nothing to commit|no changes added to commit/i.test(output)) {
    return { kind: 'nothing-to-commit', summary: 'Nothing to commit' };
  }
  if (phase === 'commit' && diagnostics.exitCode !== null) {
    return { kind: 'rejected', summary: 'Commit rejected' };
  }
  if (phase === 'staging')
    return { kind: 'execution', summary: 'Could not stage selected changes' };
  if (phase === 'index-reconcile') {
    return {
      kind: 'execution',
      summary: 'Commit created, but staged state could not be refreshed',
    };
  }
  return { kind: 'execution', summary: 'Commit failed' };
}

export async function getBranchName(repoRoot: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', repoRoot, 'branch', '--show-current'], {
      timeout: GIT_QUERY_TIMEOUT_MS,
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export async function getLastCommitFiles(repoRoot: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', repoRoot, 'show', 'HEAD', '--name-status', '--pretty=format:'],
      { timeout: GIT_QUERY_TIMEOUT_MS },
    );
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export async function getLastCommitDiff(repoRoot: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', repoRoot, 'show', 'HEAD', '-p', '--pretty=format:', '--no-color', '-U2'],
      { timeout: GIT_QUERY_TIMEOUT_MS, maxBuffer: 5 * 1024 * 1024 },
    );
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export async function getLastCommitMessage(repoRoot: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', repoRoot, 'log', '-1', '--format=%B'], {
      timeout: GIT_QUERY_TIMEOUT_MS,
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export function blockedCommitFailure(repoRoot: string, summary: string): GitCommitFailure {
  return {
    ok: false,
    repoRoot,
    phase: 'preflight',
    kind: 'execution',
    summary,
    diagnostics: {
      stdout: '',
      stderr: summary,
      exitCode: null,
      signal: null,
      timedOut: false,
      cancelled: false,
      outputTooLarge: false,
    },
    workingTreeChanged: false,
    commitCreated: false,
  };
}

export async function preflightCommit(repoRoot: string): Promise<GitCommitPreflightResult> {
  try {
    await Promise.all([
      assertIndexIsResolved(repoRoot),
      execFileAsync('git', ['-C', repoRoot, 'rev-parse', '--git-dir'], {
        timeout: GIT_QUERY_TIMEOUT_MS,
      }),
      execFileAsync('git', ['-C', repoRoot, 'var', 'GIT_AUTHOR_IDENT'], {
        timeout: GIT_QUERY_TIMEOUT_MS,
      }),
    ]);
    return { ok: true, repoRoot };
  } catch (error) {
    const diagnostics = normalizeProcessFailure(error);
    return {
      ok: false,
      repoRoot,
      phase: 'preflight',
      ...classifyFailure('preflight', diagnostics),
      diagnostics,
      workingTreeChanged: false,
      commitCreated: false,
    };
  }
}

export async function commitFiles(
  request: GitCommitRequest,
  signal?: AbortSignal,
): Promise<GitCommitResult> {
  const { repoRoot, files, message, amend = false, skipHooks = false } = request;
  let phase: GitCommitFailurePhase = 'preflight';
  let temporaryIndex: TemporaryIndex | null = null;
  let commitHash: string | null = null;
  let initialSnapshot: Awaited<ReturnType<typeof tryCaptureWorkingTree>> = null;

  try {
    await assertIndexIsResolved(repoRoot);
    const previousHead = await readHead(repoRoot);
    signal?.throwIfAborted();
    initialSnapshot = await tryCaptureWorkingTree(repoRoot);
    temporaryIndex = await createTemporaryIndex(repoRoot);

    phase = 'staging';
    await stageCommitFiles(repoRoot, files, temporaryIndex, signal);
    if (!amend) await assertHasStagedChanges(repoRoot, temporaryIndex);
    signal?.throwIfAborted();

    phase = 'commit';
    const commitArgs = ['-C', repoRoot, 'commit', '--allow-empty-message'];
    if (amend) commitArgs.push('--amend');
    if (skipHooks) commitArgs.push('--no-verify');
    commitArgs.push('-m', message);
    await runCancellableGit(commitArgs, {
      env: temporaryIndex.env,
      timeoutMs: COMMIT_TIMEOUT_MS,
      maxOutputBytes: MAX_COMMIT_OUTPUT_BYTES,
      signal,
    });

    commitHash = await readHead(repoRoot);
    if (!commitHash) throw new Error('Git did not create a commit');

    phase = 'index-reconcile';
    await reconcileRealIndex(repoRoot, previousHead, commitHash);
    const workingTreeChanged = await hasWorkingTreeChanged(repoRoot, initialSnapshot);

    return { ok: true, repoRoot, commitHash, workingTreeChanged };
  } catch (error) {
    const diagnostics = normalizeProcessFailure(error);
    const classification = classifyFailure(phase, diagnostics);
    const workingTreeChanged = await hasWorkingTreeChanged(repoRoot, initialSnapshot);

    return {
      ok: false,
      repoRoot,
      phase,
      ...classification,
      diagnostics,
      workingTreeChanged,
      commitCreated: commitHash !== null,
    };
  } finally {
    await removeTemporaryIndex(temporaryIndex);
  }
}
