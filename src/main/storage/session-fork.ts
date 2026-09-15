import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  SessionManager,
  type SessionEntry,
  collectEntriesForBranchSummary,
  generateBranchSummary,
} from '@earendil-works/pi-coding-agent';
import type { Model, Api } from '@earendil-works/pi-ai';
import { createLogger } from '../logger';
import { selectTranscriptFile, type TranscriptCandidate } from './transcript-discovery';

const log = createLogger('session-fork');

export interface ForkSessionTranscriptInput {
  parentSessionDir: string;
  parentRuntimeSessionId: string | undefined;
  newSessionDir: string;
  cutoffMs: number;
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

function lastEntryIdBefore(entries: readonly SessionEntry[], cutoffMs: number): string | null {
  let lastId: string | null = null;
  for (const entry of entries) {
    if (Date.parse(entry.timestamp) >= cutoffMs) break;
    lastId = entry.id;
  }
  return lastId;
}

export function forkSessionTranscript(input: ForkSessionTranscriptInput): Promise<void> {
  const transcriptFile = findTranscriptFile(input.parentSessionDir, input.parentRuntimeSessionId);
  if (!transcriptFile) {
    log.warn(
      input.parentRuntimeSessionId
        ? `no Pi transcript matched runtimeSessionId in ${input.parentSessionDir}; branch will start clean`
        : `no Pi transcript found in ${input.parentSessionDir}; branch will start clean`,
    );
    return Promise.resolve();
  }
  if (!input.parentRuntimeSessionId) {
    log.warn(`runtimeSessionId missing for ${input.parentSessionDir}; using newest Pi transcript`);
  }

  try {
    const manager = SessionManager.open(transcriptFile, input.newSessionDir);
    const oldLeafId = manager.getLeafId();
    const leafId = lastEntryIdBefore(manager.getEntries(), input.cutoffMs);
    if (!leafId) {
      log.warn(
        `no entries before cutoff (${new Date(input.cutoffMs).toISOString()}) in ${transcriptFile} — ` +
          'branch will start with an empty agent transcript',
      );
      return Promise.resolve();
    }

    return forkTranscriptWithSummaryOrCutoff(manager, oldLeafId, leafId, input.summarizer);
  } catch (e) {
    log.error('failed to fork transcript:', e);
    return Promise.resolve();
  }
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
): Promise<void> {
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
  if (summaryText) {
    manager.branchWithSummary(leafId, summaryText, summaryDetails, false, summaryUsage);
  }
}
