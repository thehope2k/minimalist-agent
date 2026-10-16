import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  SessionManager,
  type SessionEntry,
  type SessionMessageEntry,
  collectEntriesForBranchSummary,
  generateBranchSummary,
} from '@earendil-works/pi-coding-agent';
import type { Model, Api } from '@earendil-works/pi-ai';
import { createLogger } from '../logger';
import { selectTranscriptFile, type TranscriptCandidate } from './transcript-discovery';

const log = createLogger('session-fork');

const MAX_FALLBACK_GAP_MS = 60_000;

export type ForkOutcome =
  | 'forked'
  | 'forked-without-summary'
  | 'forked-approximate'
  | 'no-transcript'
  | 'nothing-before-cutoff'
  | 'failed';

export interface ForkResult {
  outcome: ForkOutcome;
  sessionId?: string;
  sessionFile?: string;
}

export interface DivergenceMessage {
  text: string;
  createdAtMs: number;
}

export interface ForkSessionTranscriptInput {
  parentSessionDir: string;
  parentRuntimeSessionId: string | undefined;
  newSessionDir: string;
  /** Pinned in the new header so Pi's cwd-filtered discovery finds the transcript. */
  cwd: string;
  divergence: DivergenceMessage;
  /** When set, the abandoned tail is summarized and attached to the new
   *  branch instead of a hard cutoff; falls back to a cutoff on failure. */
  summarizer?: {
    model: Model<Api>;
    apiKey: string | undefined;
    headers?: Record<string, string>;
    env?: Record<string, string>;
  };
}

function findTranscriptFile(sessionDir: string, runtimeSessionId?: string): string | undefined {
  if (!existsSync(sessionDir)) return undefined;
  const candidates: TranscriptCandidate[] = [];
  for (const entry of readdirSync(sessionDir, { withFileTypes: true })) {
    if (!entry.isFile() || entry.name === 'messages.jsonl' || !entry.name.endsWith('.jsonl'))
      continue;
    const path = join(sessionDir, entry.name);
    try {
      candidates.push({ path, mtimeMs: statSync(path).mtimeMs });
    } catch (err) {
      log.warn(`Could not inspect potential Pi transcript ${path}:`, err);
    }
  }
  return selectTranscriptFile(candidates, runtimeSessionId);
}

function messageText(entry: SessionMessageEntry): string {
  const { content } = entry.message as { content?: unknown };
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((block) => (block?.type === 'text' ? String(block.text ?? '') : '')).join('');
}

function closestToTime<T extends SessionEntry>(entries: readonly T[], targetMs: number): T | null {
  let closest: T | null = null;
  let closestGap = Infinity;
  for (const entry of entries) {
    const gap = Math.abs(Date.parse(entry.timestamp) - targetMs);
    if (gap < closestGap) {
      closest = entry;
      closestGap = gap;
    }
  }
  return closest;
}

function lastEntryBefore(entries: readonly SessionEntry[], targetMs: number): string | null {
  let lastId: string | null = null;
  for (const entry of entries) {
    if (Date.parse(entry.timestamp) >= targetMs) break;
    lastId = entry.id;
  }
  return lastId;
}

export interface DivergenceCut {
  leafId: string | null;
  exact: boolean;
}

/**
 * Pi stamps a user entry independently of the stored `createdAt` (it can land
 * seconds earlier), so a pure timestamp cutoff would keep the very message the
 * branch is meant to drop. Text identifies it. Text can miss (skill/mention
 * expansion rewrites it, or Pi never recorded an aborted turn), so the
 * fallback trusts only a user entry recorded close in time and otherwise cuts
 * at the last entry before `createdAt`; that cut is flagged as approximate.
 * The text match is deliberately not time-bounded: its gaps legitimately reach
 * minutes in real transcripts, and text is the stronger signal.
 */
export function leafBeforeDivergence(
  entries: readonly SessionEntry[],
  divergence: DivergenceMessage,
): DivergenceCut {
  const userEntries = entries.filter(
    (entry): entry is SessionMessageEntry =>
      entry.type === 'message' && entry.message.role === 'user',
  );
  const wanted = divergence.text.trim();
  const sameText = wanted
    ? userEntries.filter((entry) => messageText(entry).trimEnd().endsWith(wanted))
    : [];
  const matched = closestToTime(sameText, divergence.createdAtMs);
  if (matched) return { leafId: matched.parentId, exact: true };

  const nearest = closestToTime(userEntries, divergence.createdAtMs);
  const isNearby =
    nearest !== null &&
    Math.abs(Date.parse(nearest.timestamp) - divergence.createdAtMs) <= MAX_FALLBACK_GAP_MS;
  const leafId = isNearby ? nearest.parentId : lastEntryBefore(entries, divergence.createdAtMs);
  return { leafId, exact: false };
}

export async function forkSessionTranscript(
  input: ForkSessionTranscriptInput,
): Promise<ForkResult> {
  try {
    return await forkFromParentTranscript(input);
  } catch (e) {
    log.error('failed to fork transcript:', e);
    return { outcome: 'failed' };
  }
}

async function forkFromParentTranscript(input: ForkSessionTranscriptInput): Promise<ForkResult> {
  const transcriptFile = findTranscriptFile(input.parentSessionDir, input.parentRuntimeSessionId);
  if (!transcriptFile) {
    log.warn(
      input.parentRuntimeSessionId
        ? `no Pi transcript matched runtimeSessionId in ${input.parentSessionDir}; branch will start clean`
        : `no Pi transcript found in ${input.parentSessionDir}; branch will start clean`,
    );
    return { outcome: 'no-transcript' };
  }
  if (!input.parentRuntimeSessionId) {
    log.warn(`runtimeSessionId missing for ${input.parentSessionDir}; using newest Pi transcript`);
  }

  const manager = SessionManager.open(transcriptFile, input.newSessionDir, input.cwd);
  const oldLeafId = manager.getLeafId();
  const { leafId, exact } = leafBeforeDivergence(manager.getEntries(), input.divergence);
  if (!leafId) {
    log.warn(
      `no entries before the divergence message in ${transcriptFile} — ` +
        'branch will start with an empty agent transcript',
    );
    return { outcome: 'nothing-before-cutoff' };
  }

  const summarized = await forkTranscriptWithSummaryOrCutoff(
    manager,
    oldLeafId,
    leafId,
    input.summarizer,
  );
  const sessionFile = manager.getSessionFile();
  const outcome = forkOutcome(exact, Boolean(input.summarizer), summarized);
  if (!sessionFile || !existsSync(sessionFile)) return { outcome };
  return { outcome, sessionId: manager.getSessionId(), sessionFile };
}

function forkOutcome(exact: boolean, wantedSummary: boolean, summarized: boolean): ForkOutcome {
  if (!exact) return 'forked-approximate';
  return wantedSummary && !summarized ? 'forked-without-summary' : 'forked';
}

/**
 * Cuts the branch at `leafId` and, when a summarizer is configured, attaches
 * a branch_summary entry covering the abandoned tail (`oldLeafId` down to
 * `leafId`). `createBranchedSession` must run before `branchWithSummary`,
 * since it repoints the manager at the new isolated file.
 */
async function forkTranscriptWithSummaryOrCutoff(
  manager: SessionManager,
  oldLeafId: string | null,
  leafId: string,
  summarizer: ForkSessionTranscriptInput['summarizer'],
): Promise<boolean> {
  let summaryText: string | undefined;
  let summaryDetails: unknown;
  let summaryUsage: import('@earendil-works/pi-ai/compat').Usage | undefined;

  if (summarizer) {
    try {
      const { entries } = collectEntriesForBranchSummary(manager, oldLeafId, leafId);
      if (entries.length > 0) {
        const result = await generateBranchSummary(entries, {
          model: summarizer.model,
          apiKey: summarizer.apiKey,
          headers: summarizer.headers,
          env: summarizer.env,
          signal: new AbortController().signal,
        });
        if (result.error || result.aborted) {
          log.warn(
            `branch summarization failed (${result.error ?? 'aborted'}) — falling back to a clean cutoff`,
          );
        } else if (result.summary) {
          summaryText = result.summary;
          summaryDetails = {
            readFiles: result.readFiles ?? [],
            modifiedFiles: result.modifiedFiles ?? [],
          };
          summaryUsage = result.usage;
        }
      }
    } catch (e) {
      log.warn('branch summarization threw — falling back to a clean cutoff:', e);
    }
  }

  manager.createBranchedSession(leafId);
  if (!summaryText) return false;
  try {
    manager.branchWithSummary(leafId, summaryText, summaryDetails, false, summaryUsage);
    return true;
  } catch (e) {
    log.warn('attaching the branch summary failed — keeping the clean cutoff:', e);
    return false;
  }
}
