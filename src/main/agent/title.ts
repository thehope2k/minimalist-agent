// One-shot LLM call to summarize a session into a short title.
//
//   Anthropic connections → @anthropic-ai/claude-agent-sdk one-turn query
//   Pi/Copilot connections  → Pi subprocess mini_completion RPC
//
// Defaults to Haiku 4.5 for Anthropic and a small Pi-known mini model
// for Copilot. Returns null on any error so the caller falls back to
// the renderer-side heuristic title.

import {query, type SDKMessage} from '@anthropic-ai/claude-agent-sdk';
import {getDefaultOptions, locateClaudeCli} from './options';
import type {AnthropicAuth, ResolvedAuth} from './claude';
import {runPiMiniCompletion} from './backends/pi/agent';
import {sessionPath} from '../storage/sessions';

const ANTHROPIC_HAIKU = 'claude-haiku-4-5-20251001';
const PI_DEFAULT_MINI = 'claude-haiku-4.5';
const TITLE_MAX_TOKENS = 256;
const TITLE_MAX_WORDS = 8;

const SYSTEM_PROMPT = [
  'You generate concise titles for chat conversations.',
  'Reply with ONLY the title — 3 to 8 words, plain text.',
  'No markdown, no quotes, no preamble like "Title:". No trailing punctuation.',
  'Examples: React state debugging plan | Postgres migration rollout strategy | Setup CI for monorepo.',
].join(' ');

interface TitleSample {
  role: 'user' | 'assistant';
  content: string;
}

export interface GenerateTitleArgs {
  auth: ResolvedAuth;
  messages: TitleSample[];
  /** Override the title model. Defaults are provider-specific. */
  model?: string;
  /** Required when auth is `copilot_oauth` — used by the Pi subprocess. */
  connectionSlug?: string;
  /** Required when auth is `copilot_oauth` — anchors the Pi session log. */
  chatSessionId?: string;
  /** Optional cwd hint for the Pi subprocess. */
  cwd?: string;
}

/**
 * Strip preambles ("Title:", "Sure!"), wrapping quotes, markdown, trailing
 * punctuation, then clamp to ≤10 words / 80 chars. Returns null when the
 * model returned nothing usable.
 */
export function validateTitle(raw: string): string | null {
  let s = raw.trim();
  if (!s) return null;

  for (let i = 0; i < 3; i++) {
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
      s = s.slice(1, -1).trim();
    } else break;
  }
  s = s.replace(/^`+|`+$/g, '').trim();
  // Strip leading conversational filler ("Sure!", "Of course,", "Certainly:",
  // "Here's a title:", "Based on the conversation,", etc.) — Copilot/GPT
  // models leak these even with explicit instructions not to.
  for (let i = 0; i < 3; i++) {
    const before = s;
    s = s.replace(
      /^(title|here(?:'s| is)( a)?( suggested)?( title)?|sure|of course|certainly|okay|ok|based on (?:the |this )?(?:conversation|chat|exchange|discussion))\s*[:,\-—!.]?\s*/i,
      '',
    );
    if (s === before) break;
  }
  s = s.replace(/^["'`]|["'`]$/g, '').trim();
  s = s.replace(/[*_]+/g, '').trim();

  s = s.split(/\r?\n/)[0]?.trim() ?? '';
  s = s.replace(/[.,;:!?]+$/g, '').trim();

  if (!s) return null;

  const words = s.split(/\s+/);
  if (words.length > TITLE_MAX_WORDS) s = words.slice(0, TITLE_MAX_WORDS).join(' ');
  if (s.length > 80) s = s.slice(0, 77).trimEnd() + '…';

  return s || null;
}

/**
 * Run a one-turn no-tools LLM call to generate a title. Provider-aware:
 *   anthropic → Claude SDK
 *   copilot   → Pi mini_completion RPC
 */
export async function generateTitle(args: GenerateTitleArgs): Promise<string | null> {
  const sample = pickSample(args.messages);
  if (!sample.trim()) return null;

  if (args.auth.type === 'copilot_oauth') {
    if (!args.connectionSlug || !args.chatSessionId) return null;
    try {
      const result = await runPiMiniCompletion({
        connectionSlug: args.connectionSlug,
        auth: args.auth,
        piAuthProvider: 'github-copilot',
        chatSessionId: args.chatSessionId,
        chatSessionPath: sessionPath(args.chatSessionId),
        cwd: args.cwd,
        model: args.model ?? PI_DEFAULT_MINI,
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: sample,
        maxTokens: TITLE_MAX_TOKENS,
      });
      if (result.error) {
        console.warn(`[title][pi] mini_completion error: ${result.error}`);
        return null;
      }
      if (!result.text) return null;
      return validateTitle(result.text);
    } catch (e) {
      console.warn(
        `[title][pi] threw: ${e instanceof Error ? e.message : String(e)}`,
      );
      return null;
    }
  }

  // Anthropic path.
  if (!locateClaudeCli()) return null;
  if (
    args.auth.type !== 'anthropic_api_key' &&
    args.auth.type !== 'anthropic_oauth'
  ) {
    return null;
  }
  const anthropicAuth: AnthropicAuth = args.auth;

  const options = {
    ...getDefaultOptions({ envOverrides: envForAnthropicAuth(anthropicAuth) }),
    model: args.model ?? ANTHROPIC_HAIKU,
    maxTurns: 1,
    permissionMode: 'bypassPermissions' as const,
    tools: [],
    systemPrompt: SYSTEM_PROMPT,
    settingSources: [] as Array<'user' | 'project' | 'local'>,
    includePartialMessages: false,
    stderr: () => {},
  };

  try {
    let collected = '';
    for await (const msg of query({
      prompt: sample,
      options,
    }) as AsyncIterable<SDKMessage>) {
      if (msg.type === 'assistant') {
        const content = msg.message?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block && (block as { type?: string }).type === 'text') {
              collected += (block as { text?: string }).text ?? '';
            }
          }
        }
      } else if (msg.type === 'result') {
        break;
      }
    }
    return validateTitle(collected);
  } catch {
    return null;
  }
}

function envForAnthropicAuth(auth: AnthropicAuth): Record<string, string> {
  return auth.type === 'anthropic_api_key'
    ? { ANTHROPIC_API_KEY: auth.apiKey }
    : { CLAUDE_CODE_OAUTH_TOKEN: auth.accessToken };
}

function pickSample(messages: TitleSample[]): string {
  const first = messages.find((m) => m.role === 'user');
  if (!first) return '';
  let out = `User: ${trimTo(first.content, 800)}`;
  const reply = messages.find(
    (m) => m.role === 'assistant' && m.content.trim().length > 0,
  );
  if (reply) out += `\n\nAssistant: ${trimTo(reply.content, 400)}`;
  return out;
}

function trimTo(text: string, n: number): string {
  const t = text.trim();
  return t.length <= n ? t : t.slice(0, n - 1) + '…';
}
