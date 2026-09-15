import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getBuiltinModel } from '@earendil-works/pi-ai/providers/all';
import type { Api, Model } from '@earendil-works/pi-ai';
import { resolveAuthForSlug } from '../auth/resolve';
import { createLogger } from '../logger';
import { listConnections } from './connections';
import { save } from './json-store';
import { Paths } from './paths';
import { forkSessionTranscript } from './session-fork';
import { metaSchema } from './session-meta';
import type { SessionMeta, StoredMessage } from './session-types';

const log = createLogger('session-branch');

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

export async function persistSessionBranch(input: {
  parentId: string;
  parent: { meta: SessionMeta; messages: StoredMessage[] };
  cutIndex: number;
  id: string;
  options?: { withContext?: boolean };
}): Promise<SessionMeta> {
  const { parentId, parent, cutIndex, id, options } = input;
  const now = Date.now();
  const parentTitle = parent.meta.title?.trim();
  const meta: SessionMeta = {
    id,
    title: parentTitle ? `Branch: ${parentTitle}`.slice(0, 80) : 'New session',
    archived: false,
    createdAt: now,
    lastMessageAt: now,
    workingDirectory: parent.meta.workingDirectory,
    projectId: parent.meta.projectId ?? null,
    connectionSlug: parent.meta.connectionSlug,
    model: parent.meta.model,
    permissionMode: parent.meta.permissionMode,
  };
  save(metaSchema(id), meta);
  const messages = parent.messages.slice(0, cutIndex);
  const messagesPath = join(Paths.sessionsDir(), id, 'messages.jsonl');
  if (messages.length > 0) {
    writeFileSync(
      messagesPath,
      `${messages.map((message) => JSON.stringify(message)).join('\n')}\n`,
      'utf-8',
    );
    meta.lastMessageAt = messages[messages.length - 1]!.createdAt;
    save(metaSchema(id), meta);
  } else writeFileSync(messagesPath, '', 'utf-8');
  await forkSessionTranscript({
    parentSessionDir: join(Paths.sessionsDir(), parentId),
    parentRuntimeSessionId: parent.meta.runtimeSessionId,
    newSessionDir: join(Paths.sessionsDir(), id),
    cutoffMs: parent.messages[cutIndex]!.createdAt,
    summarizer: options?.withContext ? await resolveForkSummarizer(parent.meta) : undefined,
  });
  return meta;
}
