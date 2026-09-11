// One-shot mini-completion RPC to summarize a session into a short title.
// Returns null on any error so the caller falls back to the renderer-side
// heuristic title.

import { runMiniCompletion } from './pi/agent';
import type { ResolvedAuth } from './auth';
import { sessionPath } from '../storage/sessions';
import { listConnections } from '../storage/connections';
import { createLogger } from '../logger';

const log = createLogger('title');

const DEFAULT_TITLE_MODEL = 'claude-haiku-4.5';
const TITLE_MAX_TOKENS = 256;
const TITLE_MAX_WORDS = 7;

const SYSTEM_PROMPT = [
  'You generate concise titles for chat conversations.',
  'Reply with ONLY the title — 3 to 7 words, plain text.',
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
  /** Override the title model. Defaults to the connection's default model. */
  model?: string;
  /** Connection slug used by the agent subprocess. */
  connectionSlug?: string;
  /** Anchors the runtime session log. */
  chatSessionId?: string;
  /** Optional cwd hint for the agent subprocess. */
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

/** Run a one-turn, no-tools mini-completion to generate a title. */
export async function generateTitle(args: GenerateTitleArgs): Promise<string | null> {
  const sample = pickSample(args.messages);
  if (!sample.trim()) return null;
  if (!args.connectionSlug || !args.chatSessionId) return null;

  // Custom endpoints (local Ollama / OpenAI-compatible) register a single
  // model — the session model. The title must reuse that exact id, so we
  // fall back to the connection's default model when none is supplied.
  const model =
    args.model ??
    listConnections().find((c) => c.slug === args.connectionSlug)?.defaultModel ??
    (args.auth.type === 'oauth' ? DEFAULT_TITLE_MODEL : undefined);
  if (!model) return null;

  try {
    const result = await runMiniCompletion({
      connectionSlug: args.connectionSlug,
      auth: args.auth,
      chatSessionId: args.chatSessionId,
      chatSessionPath: sessionPath(args.chatSessionId),
      cwd: args.cwd,
      model,
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: sample,
      maxTokens: TITLE_MAX_TOKENS,
    });
    if (result.error) {
      log.warn(`mini_completion error: ${result.error}`);
      return null;
    }
    if (!result.text) return null;
    return validateTitle(result.text);
  } catch (e) {
    log.warn(`threw: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
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
