import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { getBuiltinModel } from '@earendil-works/pi-ai/providers/all';
import type { Api, Model } from '@earendil-works/pi-ai';
import { resolveAuthForSlug } from '../auth/resolve';
import { createLogger } from '../logger';
import { sessionScratchDir } from '../agent-runtime/pi/chat-workspace';
import { listConnections } from './connections';
import { save } from './json-store';
import { writeStoredMessages } from './message-log';
import { Paths } from './paths';
import { cloneDirectory, MAX_CLONE_BYTES, type CloneOutcome } from './session-clone';
import { forkSessionTranscript, type ForkResult } from './session-fork';
import { createSessionIdRewriter, rewriteTranscriptFile } from './session-id-rewrite';
import { metaSchema } from './session-meta';
import type { SessionMeta, StoredMessage } from './session-types';

const log = createLogger('session-branch');

const ATTACHMENTS_DIR_NAME = 'attachments';
const MAX_CLONE_MB = MAX_CLONE_BYTES / (1024 * 1024);
const MAX_TITLE_LENGTH = 80;

export interface BranchResult {
  meta: SessionMeta;
  warnings: string[];
}

type Summarizer = {
  model: Model<Api>;
  apiKey: string | undefined;
  headers?: Record<string, string>;
  env?: Record<string, string>;
};

async function resolveForkSummarizer(parentMeta: SessionMeta): Promise<Summarizer | undefined> {
  if (!parentMeta.connectionSlug || !parentMeta.model) return undefined;
  const connection = listConnections().find((item) => item.slug === parentMeta.connectionSlug);
  if (!connection || connection.providerType !== 'github-copilot') return undefined;
  try {
    const model = getBuiltinModel('github-copilot', parentMeta.model as never);
    if (!model) return undefined;
    const auth = await resolveAuthForSlug(parentMeta.connectionSlug);
    return auth.type === 'oauth' ? { model, apiKey: auth.accessToken } : undefined;
  } catch (error) {
    log.warn(
      'Failed to resolve fork-with-context summarizer, falling back to a clean cutoff:',
      error,
    );
    return undefined;
  }
}

function branchTitle(parentTitle: string | undefined): string {
  const trimmed = parentTitle?.trim();
  return trimmed ? `Branch: ${trimmed}`.slice(0, MAX_TITLE_LENGTH) : 'New session';
}

function buildBranchMeta(parent: SessionMeta, id: string): SessionMeta {
  const now = Date.now();
  return {
    id,
    title: branchTitle(parent.title),
    archived: false,
    createdAt: now,
    lastMessageAt: now,
    workingDirectory: parent.workingDirectory,
    projectId: parent.projectId ?? null,
    connectionSlug: parent.connectionSlug,
    model: parent.model,
    permissionMode: parent.permissionMode,
    autonomyLevel: parent.autonomyLevel,
    thinkingLevel: parent.thinkingLevel,
    pinnedAssets: parent.pinnedAssets && [...parent.pinnedAssets],
    activatedExtensions: parent.activatedExtensions && [...parent.activatedExtensions],
  };
}

async function cloneOne(label: string, source: string, destination: string): Promise<string[]> {
  let outcome: CloneOutcome;
  try {
    outcome = await cloneDirectory(source, destination);
  } catch (error) {
    log.warn(`Failed to copy ${label} into the branch:`, error);
    return [`The parent's ${label} could not be copied into the branch.`];
  }
  return outcome === 'too-large'
    ? [`The parent's ${label} exceed ${MAX_CLONE_MB} MB, so they were not copied into the branch.`]
    : [];
}

async function cloneSessionFiles(parentDir: string, newDir: string): Promise<string[]> {
  const warnings = await Promise.all([
    cloneOne('scratch files', sessionScratchDir(parentDir), sessionScratchDir(newDir)),
    cloneOne(
      'attachments',
      join(parentDir, ATTACHMENTS_DIR_NAME),
      join(newDir, ATTACHMENTS_DIR_NAME),
    ),
  ]);
  return warnings.flat();
}

const FORK_WARNINGS: Partial<Record<ForkResult['outcome'], string>> = {
  failed: 'The agent’s memory could not be copied; it starts this branch without context.',
  'no-transcript':
    'No agent transcript was found for the parent; the agent starts without context.',
  'nothing-before-cutoff':
    'No agent history precedes this message; the agent starts without context.',
  'forked-without-summary':
    'The summary could not be generated; the branch was cut cleanly instead.',
  'forked-approximate':
    'Could not pinpoint this message in the agent’s history; its context may be off by a turn.',
};

function forkWarnings(result: ForkResult, hasHistory: boolean): string[] {
  const warning = FORK_WARNINGS[result.outcome];
  const isNoHistoryOutcome =
    result.outcome === 'no-transcript' || result.outcome === 'nothing-before-cutoff';
  if (!warning || (isNoHistoryOutcome && !hasHistory)) return [];
  return [warning];
}

function retargetTranscript(
  result: ForkResult,
  rewrite: ReturnType<typeof createSessionIdRewriter>,
): string[] {
  if (!result.sessionFile) return [];
  try {
    rewriteTranscriptFile(result.sessionFile, rewrite);
    return [];
  } catch (error) {
    log.error('Failed to retarget the forked transcript at the branch:', error);
    return ['The agent may still refer to the parent session’s files.'];
  }
}

interface PersistBranchInput {
  parentId: string;
  parent: { meta: SessionMeta; messages: StoredMessage[] };
  cutIndex: number;
  id: string;
  options?: { withContext?: boolean };
}

async function populateBranch(input: PersistBranchInput, meta: SessionMeta): Promise<BranchResult> {
  const { parentId, parent, cutIndex, id, options } = input;
  const parentDir = join(Paths.sessionsDir(), parentId);
  const newDir = join(Paths.sessionsDir(), id);
  const rewrite = createSessionIdRewriter(Paths.sessionsDir(), parentId, id);

  const messages = parent.messages.slice(0, cutIndex).map(rewrite);
  writeStoredMessages(join(newDir, 'messages.jsonl'), messages);
  meta.lastMessageAt = messages.at(-1)?.createdAt ?? meta.lastMessageAt;

  const warnings = await cloneSessionFiles(parentDir, newDir);

  const divergence = parent.messages[cutIndex]!;
  const summarizer = options?.withContext ? await resolveForkSummarizer(parent.meta) : undefined;
  if (options?.withContext && !summarizer) {
    warnings.push('Summarized branching is unavailable for this connection; branched cleanly.');
  }
  const fork = await forkSessionTranscript({
    parentSessionDir: parentDir,
    parentRuntimeSessionId: parent.meta.runtimeSessionId,
    newSessionDir: newDir,
    cwd: parent.meta.workingDirectory ?? sessionScratchDir(newDir),
    divergence: { text: divergence.content, createdAtMs: divergence.createdAt },
    summarizer,
  });
  warnings.push(...forkWarnings(fork, messages.length > 0));
  warnings.push(...retargetTranscript(fork, rewrite));

  meta.runtimeSessionId = fork.sessionId;
  save(metaSchema(id), meta);
  return { meta, warnings };
}

/**
 * `session.json` is written first so a crash mid-branch leaves a listable,
 * prunable session rather than an invisible directory of cloned files.
 */
export async function persistSessionBranch(input: PersistBranchInput): Promise<BranchResult> {
  const meta = buildBranchMeta(input.parent.meta, input.id);
  save(metaSchema(input.id), meta);
  try {
    return await populateBranch(input, meta);
  } catch (error) {
    log.error(`Branching ${input.parentId} failed; removing the partial branch:`, error);
    rmSync(join(Paths.sessionsDir(), input.id), { recursive: true, force: true });
    throw error;
  }
}
