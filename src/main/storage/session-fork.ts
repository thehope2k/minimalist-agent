import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SessionManager, type SessionEntry } from '@earendil-works/pi-coding-agent';
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
}

/** Forks the parent's SDK-owned transcript up to `cutoffMs`, returning the
 *  new session's SDK session id to persist, or undefined when there's
 *  nothing to persist (Pi) or nothing could be forked. */
export async function forkSdkSession(input: ForkSdkSessionInput): Promise<string | undefined> {
  if (input.providerType === 'pi') {
    forkPiTranscript(input);
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

function forkPiTranscript(input: ForkSdkSessionInput): void {
  if (!input.parentSdkSessionId) {
    log.warn(`no sdkSessionId recorded for parent session at ${input.parentSessionDir}`);
    return;
  }

  const transcriptFile = findPiTranscriptFile(input.parentSessionDir, input.parentSdkSessionId);
  if (!transcriptFile) {
    log.warn(`no Pi transcript matching sdkSessionId ${input.parentSdkSessionId} in ${input.parentSessionDir}`);
    return;
  }

  try {
    const manager = SessionManager.open(transcriptFile, input.newSessionDir);
    const leafId = lastEntryIdBefore(manager.getEntries(), input.cutoffMs);
    if (leafId) manager.createBranchedSession(leafId);
  } catch (e) {
    log.error('failed to fork Pi transcript:', e);
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
