import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SessionManager, type SessionEntry, collectEntriesForBranchSummary, generateBranchSummary } from '@earendil-works/pi-coding-agent';
import type { Model, Api } from '@earendil-works/pi-ai';
import { forkSession as forkClaudeSession } from '@anthropic-ai/claude-agent-sdk';
import { findClaudeSessionFile } from '../agent/backends/anthropic';
import { createLogger } from '../logger';

const log = createLogger('session-fork');

export interface ForkSdkSessionInput {
  providerType: string | undefined;
  parentSessionDir: string;
  parentSdkSessionId: string | undefined;
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

/** Forks the parent's SDK-owned transcript up to `cutoffMs`, returning the
 *  new session's SDK session id to persist, or undefined when there's
 *  nothing to persist (Pi) or nothing could be forked. */
export async function forkSdkSession(input: ForkSdkSessionInput): Promise<string | undefined> {
  if (input.providerType === 'pi') {
    await forkPiTranscript(input);
    return undefined;
  }
  if (input.providerType === 'anthropic' && input.parentSdkSessionId) {
    return forkAnthropicSession(input.parentSdkSessionId, input.cutoffMs);
  }
  return undefined;
}

function findPiTranscriptFile(sessionDir: string, sdkSessionId: string): string | undefined {
  if (!existsSync(sessionDir)) return undefined;
  const fileName = readdirSync(sessionDir).find((f) => f.endsWith(`_${sdkSessionId}.jsonl`));
  return fileName ? join(sessionDir, fileName) : undefined;
}

function lastEntryIdBefore(entries: readonly SessionEntry[], cutoffMs: number): string | null {
  let lastId: string | null = null;
  for (const entry of entries) {
    if (Date.parse(entry.timestamp) >= cutoffMs) break;
    lastId = entry.id;
  }
  return lastId;
}

function forkPiTranscript(input: ForkSdkSessionInput): Promise<void> {
  if (!input.parentSdkSessionId) {
    log.warn(`no sdkSessionId recorded for parent session at ${input.parentSessionDir}`);
    return Promise.resolve();
  }

  const transcriptFile = findPiTranscriptFile(input.parentSessionDir, input.parentSdkSessionId);
  if (!transcriptFile) {
    log.warn(`no Pi transcript matching sdkSessionId ${input.parentSdkSessionId} in ${input.parentSessionDir}`);
    return Promise.resolve();
  }

  try {
    const manager = SessionManager.open(transcriptFile, input.newSessionDir);
    const oldLeafId = manager.getLeafId();
    const leafId = lastEntryIdBefore(manager.getEntries(), input.cutoffMs);
    if (!leafId) {
      log.warn(
        `no entries before cutoff (${new Date(input.cutoffMs).toISOString()}) in ${transcriptFile} — ` +
          'branch will start with an empty SDK transcript',
      );
      return Promise.resolve();
    }

    return forkPiTranscriptWithSummaryOrCutoff(manager, oldLeafId, leafId, input.summarizer);
  } catch (e) {
    log.error('failed to fork Pi transcript:', e);
    return Promise.resolve();
  }
}

/**
 * Cuts the branch at `leafId` and, when a summarizer is configured, attaches
 * a branch_summary entry covering the abandoned tail (`oldLeafId` down to
 * `leafId`). `createBranchedSession` must run before `branchWithSummary`,
 * since it repoints the manager at the new isolated file.
 */
async function forkPiTranscriptWithSummaryOrCutoff(
  manager: SessionManager,
  oldLeafId: string | null,
  leafId: string,
  summarizer: ForkSdkSessionInput['summarizer'],
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
          log.warn(`branch summarization failed (${result.error ?? 'aborted'}) — falling back to a clean cutoff`);
        } else if (result.summary) {
          summaryText = result.summary;
          summaryDetails = { readFiles: result.readFiles ?? [], modifiedFiles: result.modifiedFiles ?? [] };
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

function lastClaudeMessageUuidBefore(transcriptPath: string, cutoffMs: number): string | undefined {
  const lines = readFileSync(transcriptPath, 'utf-8').split('\n').filter((l) => l.trim());
  let lastUuid: string | undefined;
  for (const line of lines) {
    const entry = JSON.parse(line) as { uuid?: unknown; timestamp?: unknown };
    if (typeof entry.uuid !== 'string' || typeof entry.timestamp !== 'string') continue;
    if (Date.parse(entry.timestamp) >= cutoffMs) break;
    lastUuid = entry.uuid;
  }
  return lastUuid;
}

async function forkAnthropicSession(
  parentSdkSessionId: string,
  cutoffMs: number,
): Promise<string | undefined> {
  const sourcePath = findClaudeSessionFile(parentSdkSessionId);
  if (!sourcePath) {
    log.warn(`no Claude transcript found for sdkSessionId ${parentSdkSessionId}`);
    return undefined;
  }

  let upToMessageId: string | undefined;
  try {
    upToMessageId = lastClaudeMessageUuidBefore(sourcePath, cutoffMs);
  } catch (e) {
    log.error('failed to read Claude transcript:', e);
    return undefined;
  }
  if (!upToMessageId) return undefined;

  try {
    const { sessionId } = await forkClaudeSession(parentSdkSessionId, { upToMessageId });
    return sessionId;
  } catch (e) {
    log.error('failed to fork Claude session:', e);
    return undefined;
  }
}
