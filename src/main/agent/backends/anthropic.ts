// Anthropic backend — wraps `@anthropic-ai/claude-agent-sdk`.
// Extracted from the original claude.ts so the file at that path can become
// a thin dispatcher across providerTypes.

import {
  query,
  type CanUseTool,
  type Options,
  type SDKMessage,
  type SDKUserMessage,
  type AgentDefinition,
} from '@anthropic-ai/claude-agent-sdk';
import { readFileSync, writeFileSync, chmodSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Paths } from '../../storage/paths';
import type { StoredAttachment } from '../../storage/sessions';
import {
  adaptSdkMessage,
  newAdaptState,
  type AgentChatEvent,
} from '../events';
import { parseError } from '../errors';
import { getDefaultOptions, locateClaudeCli } from '../options';
import {
  toSdkPermissionMode,
  type PermissionMode,
} from '../permissions';
import { buildSdkMcpServers } from '../../extensions/mcp-config';
import { resolveExtensionEnv } from '../../extensions/env-resolver';
import {
  buildPromptPrefix,
  buildSystemPromptAppend,
} from '../system-prompt';
import {
  extractSkillPaths,
  formatSkillDirective,
} from '../../skills/directive';
import {
  loadAllAgents,
} from '../../agents/storage';
import type { AnthropicApiKeyAuth, AnthropicOAuthAuth } from './types';

export type AnthropicAuth = AnthropicApiKeyAuth | AnthropicOAuthAuth;

export interface AnthropicChatRequest {
  auth: AnthropicAuth;
  model: string;
  prompt: string;
  attachments?: StoredAttachment[];
  cwd?: string;
  resumeSessionId?: string;
  maxTurns?: number;
  permissionMode?: PermissionMode;
  canUseTool?: CanUseTool;
  signal?: AbortSignal;
  /**
   * Caller-provided turn id. Used by `steerAnthropicTurn` to find the
   * right input queue when injecting a mid-turn message. Optional; if
   * omitted, the turn is not steerable.
   */
  turnId?: string;
  /** DB-level session identifier forwarded to the system prompt builder. */
  chatSessionId?: string;
}

/**
 * Async input queue that backs an in-flight Anthropic turn. The Claude
 * SDK consumes an AsyncIterable<SDKUserMessage>; we keep this open for
 * the duration of the turn so callers can `push()` additional user
 * messages mid-stream.
 */
class SteerableInput {
  private resolvers: Array<(v: IteratorResult<SDKUserMessage>) => void> = [];
  private buf: SDKUserMessage[] = [];
  private done = false;

  constructor(initial: SDKUserMessage) {
    this.buf.push(initial);
  }

  push(message: SDKUserMessage): void {
    if (this.done) return;
    const r = this.resolvers.shift();
    if (r) r({ value: message, done: false });
    else this.buf.push(message);
  }

  finish(): void {
    if (this.done) return;
    this.done = true;
    while (this.resolvers.length) {
      this.resolvers.shift()!({ value: undefined as never, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    return {
      next: () => {
        if (this.buf.length) {
          return Promise.resolve({ value: this.buf.shift()!, done: false });
        }
        if (this.done) {
          return Promise.resolve({ value: undefined as never, done: true });
        }
        return new Promise<IteratorResult<SDKUserMessage>>((res) =>
          this.resolvers.push(res),
        );
      },
    };
  }
}

/** Per-turn handle so `steerAnthropicTurn` can push more messages in. */
const inputsByTurnId = new Map<string, SteerableInput>();

/**
 * Convert loaded agents to SDK AgentDefinition format.
 * Returns a mapping of slug → AgentDefinition for available agents.
 */
function buildSdkAgentDefinitions(): Record<string, AgentDefinition> | undefined {
  const agents = loadAllAgents();
  if (agents.length === 0) return undefined;

  const result: Record<string, AgentDefinition> = {};
  for (const agent of agents) {
    result[agent.slug] = {
      description: agent.metadata.description,
      prompt: agent.content,
      ...(agent.metadata.model && { model: agent.metadata.model }),
      ...(agent.metadata.tools && { tools: agent.metadata.tools }),
      ...(agent.metadata.maxTurns && { maxTurns: agent.metadata.maxTurns }),
      ...(agent.metadata.permissionMode && {
        permissionMode: toSdkPermissionMode(agent.metadata.permissionMode as PermissionMode),
      }),
      ...(agent.metadata.effort && { effort: agent.metadata.effort }),
    };
  }
  return result;
}

/** Inject a user message into an in-flight Anthropic turn. */
export function steerAnthropicTurn(
  turnId: string,
  message: string,
  attachments?: StoredAttachment[],
): boolean {
  const input = inputsByTurnId.get(turnId);
  if (!input) return false;
  const msg =
    attachments && attachments.length > 0
      ? buildUserMessageWithAttachments(message, attachments)
      : buildPlainUserMessage(message);
  input.push(msg);
  return true;
}

function buildPlainUserMessage(text: string): SDKUserMessage {
  return {
    type: 'user',
    message: {
      role: 'user',
      content: [{ type: 'text', text }] as unknown as SDKUserMessage['message']['content'],
    },
    parent_tool_use_id: null,
    session_id: '',
  };
}

const DEFAULT_MAX_TURNS = 30;

const SDK_IMAGE_MEDIA: Record<string, 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'> = {
  'image/png': 'image/png',
  'image/jpeg': 'image/jpeg',
  'image/gif': 'image/gif',
  'image/webp': 'image/webp',
};

function buildUserMessageWithAttachments(
  prompt: string,
  attachments: StoredAttachment[],
): SDKUserMessage {
  type ContentBlock =
    | { type: 'text'; text: string }
    | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
    | { type: 'document'; source: { type: 'base64'; media_type: string; data: string } };

  const blocks: ContentBlock[] = [];

  for (const att of attachments) {
    blocks.push({
      type: 'text',
      text: `[Attached file: ${att.name}]\n[Stored at: ${att.storedPath}]`,
    });

    if (att.type === 'image') {
      const media = SDK_IMAGE_MEDIA[att.mimeType];
      if (!media) continue;
      let data = att.resizedBase64;
      if (!data) {
        try {
          data = readFileSync(att.storedPath).toString('base64');
        } catch {
          continue;
        }
      }
      blocks.push({ type: 'image', source: { type: 'base64', media_type: media, data } });
    } else if (att.type === 'pdf') {
      try {
        const data = readFileSync(att.storedPath).toString('base64');
        blocks.push({
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data },
        });
      } catch {
        // skip unreadable
      }
    } else if (att.type === 'text' || att.type === 'snippet') {
      try {
        const content = readFileSync(att.storedPath, 'utf-8');
        // Replace the stub header with the real content.
        blocks.pop(); // remove the [Attached file] stub just pushed
        blocks.push({
          type: 'text',
          text: `[File: ${att.name}]\n\`\`\`\n${content}\n\`\`\``,
        });
      } catch {
        // keep the stub if the file is unreadable
      }
    }
  }

  if (prompt.trim()) blocks.push({ type: 'text', text: prompt });

  return {
    type: 'user',
    message: {
      role: 'user',
      content: blocks as unknown as SDKUserMessage['message']['content'],
    },
    parent_tool_use_id: null,
    session_id: '',
  };
}

/**
 * Write our OAuth access token into the format the modern Claude Code
 * binary expects: `<CLAUDE_CONFIG_DIR>/.credentials.json` containing
 * `{ claudeAiOauth: { accessToken, expiresAt, scopes, subscriptionType } }`.
 *
 * The binary refuses tokens missing `expiresAt` (treats them as already
 * expired and prints "Not logged in"). We stamp a 1-hour-from-now value
 * since `auth/resolve.ts` already refreshes upstream and we rewrite this
 * file on every turn — the binary will never have a stale token in hand.
 *
 * `refreshToken` is deliberately omitted: refreshes are ours to own; the
 * binary should treat the token as opaque.
 *
 * Returns the dir to set as `CLAUDE_CONFIG_DIR`.
 */
function writeAnthropicOAuthCredentials(accessToken: string): string {
  const dir = Paths.claudeConfigDir();
  const credentialsPath = join(dir, '.credentials.json');
  const payload = JSON.stringify({
    claudeAiOauth: {
      accessToken,
      // 1h ahead — turns finish well before this; resolve.ts refreshes
      // upstream tokens on each new turn so this never goes stale.
      expiresAt: Date.now() + 60 * 60 * 1000,
      scopes: ['user:inference', 'user:profile'],
      subscriptionType: 'max',
    },
  });
  writeFileSync(credentialsPath, payload, 'utf-8');
  // Best-effort: tighten perms on POSIX so a curious sibling process
  // can't read it. Windows ignores the mode argument; harmless.
  try {
    chmodSync(credentialsPath, 0o600);
  } catch {
    /* fs without permission semantics — fine */
  }
  return dir;
}

/**
 * Check whether a Claude SDK session JSONL file exists under CLAUDE_CONFIG_DIR/projects/.
 * Returns false when the file is missing so callers can warn before a silent context reset.
 */
function findClaudeSession(sessionId: string): boolean {
  const projectsDir = join(Paths.claudeConfigDir(), 'projects');
  if (!existsSync(projectsDir)) return false;
  try {
    for (const projectDir of readdirSync(projectsDir)) {
      const candidate = join(projectsDir, projectDir, `${sessionId}.jsonl`);
      if (existsSync(candidate)) return true;
    }
  } catch {
    // ignore unreadable dirs
  }
  return false;
}

export function envForAnthropicAuth(auth: AnthropicAuth): Record<string, string> {
  if (auth.type === 'anthropic_api_key') {
    return { ANTHROPIC_API_KEY: auth.apiKey };
  }
  // OAuth: the modern SDK's native binary ignores `CLAUDE_CODE_OAUTH_TOKEN`
  // and reads credentials from `<CLAUDE_CONFIG_DIR>/.credentials.json` (or
  // the macOS keychain). Write the token to a sandboxed dir we own and
  // point the binary at it so OAuth users don't need a system-wide
  // `claude /login`.
  const configDir = writeAnthropicOAuthCredentials(auth.accessToken);
  return {
    CLAUDE_CONFIG_DIR: configDir,
    // Keep the legacy env var too for older SDK versions that still
    // honour it; modern SDKs ignore it harmlessly.
    CLAUDE_CODE_OAUTH_TOKEN: auth.accessToken,
  };
}

export async function* runAnthropicChat(
  req: AnthropicChatRequest,
): AsyncGenerator<AgentChatEvent> {
  if (!locateClaudeCli()) {
    yield {
      type: 'error',
      error: parseError(
        new Error(
          'Could not resolve @anthropic-ai/claude-agent-sdk in node_modules. Run `bun install` (or `npm install`) and try again.',
        ),
      ),
    };
    return;
  }

  const abortCtrl = new AbortController();
  if (req.signal) {
    if (req.signal.aborted) abortCtrl.abort();
    else req.signal.addEventListener('abort', () => abortCtrl.abort());
  }

  const mode: PermissionMode = req.permissionMode ?? 'ask';
  const sdkMode = toSdkPermissionMode(mode);

  const baseDefaults = getDefaultOptions({
    envOverrides: envForAnthropicAuth(req.auth),
  });

  // Warn when a stored resume ID has no matching session file — the SDK
  // silently falls back to a new session, so this surfaces the context loss.
  if (req.resumeSessionId && !findClaudeSession(req.resumeSessionId)) {
    console.warn(`[anthropic] resume session ${req.resumeSessionId} not found — starting fresh`);
  }

  const options: Options = {
    ...baseDefaults,
    model: req.model,
    includePartialMessages: true,
    abortController: abortCtrl,
    maxTurns: req.maxTurns ?? DEFAULT_MAX_TURNS,
    permissionMode: sdkMode,
    ...(mode === 'ask' && req.canUseTool ? { canUseTool: req.canUseTool } : {}),
    ...(req.cwd ? { cwd: req.cwd } : {}),
    ...(req.resumeSessionId ? { resume: req.resumeSessionId } : {}),

    tools: { type: 'preset', preset: 'claude_code' },

    // Load agent definitions (AGENT.md files) for this workspace
    agents: buildSdkAgentDefinitions(),

    mcpServers: buildSdkMcpServers(),

    // Merge auth env (process.env + ANTHROPIC_API_KEY/OAuth/CLAUDE_CONFIG_DIR
    // from getDefaultOptions) with cli-bound extension env. Previously this
    // was `env: resolveExtensionEnv()` alone, which silently wiped the
    // auth vars and made OAuth users fall through to the binary's keychain
    // lookup → "Not logged in" when no `claude /login` had been run.
    env: { ...baseDefaults.env, ...resolveExtensionEnv() },

    systemPrompt: {
      type: 'preset',
      preset: 'claude_code',
      append: buildSystemPromptAppend({ cwd: req.cwd, sessionId: req.chatSessionId, userMessage: req.prompt, authType: req.auth.type }),
    },

    settingSources: ['user', 'project', 'local'],

    stderr: (data: string) => {
      console.error('[SDK stderr]', data);
    },
  };

  const state = newAdaptState();

  const prefix = buildPromptPrefix({ cwd: req.cwd });

  // Resolve `@slug` mentions: replace with semantic markers and (if any)
  // prepend a "Read SKILL.md / guide.md first" directive. See
  // `src/main/skills/directive.ts` for the rules.
  const { skillPaths, extensionGuidePaths, filePaths, folderPaths, cleanMessage, missingSkills, missingFiles } =
    extractSkillPaths(req.prompt, req.cwd);
  if (missingSkills.length > 0) {
    yield {
      type: 'error',
      error: parseError(
        new Error(
          `Mention(s) not found: ${missingSkills.join(', ')}. ` +
            `Skills live under ~/.agents/skills/<slug>/ or <cwd>/.agents/skills/<slug>/. ` +
            `Extensions must be installed and enabled.`,
        ),
      ),
    };
    return;
  }
  if (missingFiles.length > 0) {
    yield {
      type: 'error',
      error: parseError(
        new Error(
          `File mention(s) not found: ${missingFiles.join(', ')}. ` +
            `Paths must be relative to the working directory (e.g. @docs/ROADMAP.md).`,
        ),
      ),
    };
    return;
  }
  const directive = formatSkillDirective(skillPaths, extensionGuidePaths, filePaths, folderPaths);
  const finalPrompt = [prefix, directive, cleanMessage]
    .filter(Boolean)
    .join('\n\n');

  // Build the initial user message. When the turn is steerable we wrap it
  // in a SteerableInput; the Claude SDK keeps consuming from the iterable
  // so additional messages pushed via `steerAnthropicTurn` get processed
  // mid-stream.
  const initialUserMessage =
    req.attachments && req.attachments.length > 0
      ? buildUserMessageWithAttachments(finalPrompt, req.attachments)
      : buildPlainUserMessage(finalPrompt);

  let steerable: SteerableInput | null = null;
  let promptInput: string | AsyncIterable<SDKUserMessage>;
  if (req.turnId) {
    steerable = new SteerableInput(initialUserMessage);
    inputsByTurnId.set(req.turnId, steerable);
    promptInput = steerable;
  } else {
    // No turn id → no steering; use a single-shot iterable for parity.
    promptInput = (async function* () {
      yield initialUserMessage;
    })();
  }

  try {
    for await (const msg of query({
      prompt: promptInput,
      options,
    }) as AsyncIterable<SDKMessage>) {
      const { events, terminal } = adaptSdkMessage(msg, state);
      for (const e of events) yield e;
      if (terminal) return;
    }
    if (!state.streamedText && state.fallbackText) {
      yield { type: 'text_complete', text: state.fallbackText };
    }
    yield { type: 'turn_done' };
  } catch (e) {
    yield {
      type: 'error',
      error: parseError(e),
    };
  } finally {
    if (steerable) {
      steerable.finish();
      if (req.turnId) inputsByTurnId.delete(req.turnId);
    }
  }
}
