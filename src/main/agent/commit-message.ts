// One-shot AI call to generate a conventional commit message from a diff summary.
// Reuses generateTitle's provider-aware infrastructure (Anthropic SDK + Pi mini_completion)
// but with a commit-focused system prompt and larger token budget.

import { query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { getDefaultOptions, locateClaudeCli } from './options';
import type { AnthropicAuth, ResolvedAuth } from './runner';
import { runPiMiniCompletion } from './backends/pi/agent';
import { sessionPath } from '../storage/sessions';
import { listConnections } from '../storage/connections';
import { createLogger } from '../logger';

const log = createLogger('commit-message');

const ANTHROPIC_COMMIT_MODEL = 'claude-sonnet-4-6';
const PI_COMMIT_MODEL       = 'claude-sonnet-4.6';
const COMMIT_MAX_TOKENS = 1500;

const SYSTEM_PROMPT = `You are a git commit message generator. Your entire reply is piped straight
into "git commit -m" — there is no chat, no human reviewing your reasoning,
no follow-up turn. Every character you output becomes part of the commit,
including mistakes.

=== OUTPUT CONTRACT ===
Reply starts at character 1 with the commit type and ends after the last
body line. Nothing may precede it (no analysis of the diff, no "Let me...",
no restating the task) and nothing may follow it (no offers to revise,
no questions, no sign-off).

  BAD:
    Based on the diff, two things changed: auth and caching. Let me write
    a commit that covers both.

    feat(auth,cache): add token refresh and response caching

  GOOD:
    feat(auth,cache): add token refresh and response caching

=== FORMAT ===
  <type>(<scope>): <description>   ← max 72 chars, required
  <blank line>
  <body>                           ← optional, only for complex changes

TYPES: feat, fix, refactor, docs, chore, style, test, perf, build, ci

=== CHOOSING A TYPE ===
Classify by what actually changed, not by the words used to describe it:
  - New capability or user-visible behavior      → feat
  - Broken/incorrect behavior corrected           → fix
  - Faster or lighter, same behavior              → perf
  - Internal restructuring, same behavior         → refactor
  - Tooling, dependencies, build/CI config        → build / ci
  - Docs, formatting-only, or test-only changes   → docs / style / test

"Optimization" is perf. "Enhancement" or "improvement" is feat when a user
or API consumer gains something new, refactor when nothing external changes.

RULES:
- First line: specific and technical — name the key concept, feature, or component.
- Body: short prose bullets; omit when the first line is self-explanatory.
  For changesets touching 4+ files or covering multiple concerns, a concise
  body IS expected — summarize what was added, changed, or fixed, at a level
  a reviewer skimming "git log" would want.
- Body altitude: describe the SOLUTION, not the diff. Say what changed at the
  concept/component level ("what" and "why"), not line-by-line implementation
  detail ("how") — a reviewer wants the shape of the change, not a narrated
  diff. Only go into a specific technical detail when it IS the key point of
  the commit (a tricky fix, a non-obvious workaround, a breaking behavior
  change) — otherwise keep each bullet to one general idea.

    TOO DETAILED (diff-narration):
      - changed timeout from 3000ms to 8000ms in retryConfig.ts line 42
      - added a new field lastRefreshAt to the TokenState interface
      - wrapped the fetch call in a try/catch that logs to log.warn

    RIGHT ALTITUDE (solution-level, detail only where it matters):
      - increase retry timeout to tolerate slow OAuth providers
      - track token refresh timestamps to avoid redundant refreshes
      - swallow transient network errors instead of crashing the sync loop
- Plain text only: no markdown headers, no wrapping quotes, no code fences.

=== USER CONTEXT PRIORITY ===
When the user states the change's purpose (e.g. "fix login timeout", "add
dark mode support"), that intent overrides code-only inference:
  1. Choose the commit type from user intent, not just the diff shape.
  2. Identify the scope and affected component from the diff.
  3. Frame the description from the user's stated perspective.

  Example: user says "fix login bug" but the diff adds new branches —
  recognize it's fixing broken behavior → type = "fix", not "feat".

=== MULTI-REPO RULE ===
When changes span multiple repositories, write ONE message at the product/
feature level — the shared purpose ALL repos serve. Do not list repo names
or add per-repo sections; the message must read correctly committed to any
one of the repos individually.

  Example: frontend adds OAuth UI, backend adds OAuth endpoints →
  "feat(auth): implement OAuth login" — not "frontend: ..., backend: ...".

=== AMEND RULE ===
You are amending an existing commit; the previous message and its diff are
shown for context. If ADDITIONAL STAGED CHANGES are present, produce a new
message describing the complete final state of the commit — original intent
plus the new changes as one coherent whole, not the old message unchanged.
If there are no additional staged changes, keep the original message as-is.`;

export interface GenerateCommitMessageArgs {
  auth: ResolvedAuth;
  diffContext: string;
  userContext?: string;
  model?: string;
  connectionSlug?: string;
  chatSessionId?: string;
  piAuthProvider?: string;
  cwd?: string;
}

/**
 * Strip wrapping quotes/code-fences and known conversational filler, keeping
 * multi-line body structure intact (unlike validateTitle, which flattens to
 * one line). Runs a few passes since models sometimes stack fillers
 * ("Sure, here's a commit message: feat: ...").
 */
function validateCommitMessage(raw: string): string | null {
  let s = raw.trim();
  if (!s) return null;

  s = stripCodeFence(s);
  s = stripWrappingQuotes(s);

  for (let i = 0; i < 3; i++) {
    const before = s;
    s = stripLeadingFiller(s);
    s = stripWrappingQuotes(s);
    if (s === before) break;
  }

  // Hard cap: 1200 chars (generous for type + body).
  if (s.length > 1200) s = s.slice(0, 1200).trimEnd();

  return s || null;
}

function stripCodeFence(s: string): string {
  const match = /^```[\w-]*\n([\s\S]*?)\n?```$/.exec(s.trim());
  return match ? match[1].trim() : s;
}

function stripWrappingQuotes(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1).trim();
  }
  return s;
}

/** Known leading filler phrases models emit despite the OUTPUT CONTRACT. */
const LEADING_FILLER_RE =
  /^(here(?:'s| is)(?: a| the)?(?:\s+(?:suggested|conventional|commit))?\s+(?:commit\s+)?(?:message)?|sure|of course|certainly|ok(?:ay)?|based on (?:the |this )?(?:diff|changes?|staged changes)|looking at (?:the |this )?(?:diff|changes?)|let me (?:write|draft|create|generate)[^.\n]*)\s*[:,.\-—!]?\s*/i;

function stripLeadingFiller(s: string): string {
  return s.replace(LEADING_FILLER_RE, '').trim();
}

export async function generateCommitMessage(
  args: GenerateCommitMessageArgs,
): Promise<string | null> {
  if (!args.diffContext.trim()) {
    log.warn('empty diff context');
    return null;
  }

  let userPrompt: string;
  if (args.userContext) {
    userPrompt = `User's description of the change:
"${args.userContext}"

Generate a commit message based on this intent and the following diff:

${args.diffContext}`;
  } else {
    userPrompt = `Generate a commit message for these staged changes:

${args.diffContext}`;
  }

  // Custom endpoints (local / OpenAI-compatible) reuse the session model.
  if (args.auth.type === 'local_api') {
    if (!args.connectionSlug || !args.chatSessionId) {
      log.warn(`[local_api] missing connectionSlug or chatSessionId`);
      return null;
    }
    const model =
      args.model ??
      listConnections().find((c) => c.slug === args.connectionSlug)?.defaultModel;
    if (!model) {
      log.warn(`[local_api] no model resolved for connection ${args.connectionSlug}`);
      return null;
    }
    try {
      const result = await runPiMiniCompletion({
        connectionSlug: args.connectionSlug,
        auth: args.auth,
        chatSessionId: args.chatSessionId,
        chatSessionPath: sessionPath(args.chatSessionId),
        cwd: args.cwd,
        model,
        systemPrompt: SYSTEM_PROMPT,
        userPrompt,
        maxTokens: COMMIT_MAX_TOKENS,
      });
      if (result.error || !result.text) {
        log.warn(`[local_api] mini_completion error: ${result.error ?? 'empty response'}`);
        return null;
      }
      return validateCommitMessage(result.text);
    } catch (e) {
      log.warn(`[local_api] threw: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }

  if (args.auth.type === 'copilot_oauth') {
    if (!args.connectionSlug || !args.chatSessionId) {
      log.warn(`[copilot_oauth] missing connectionSlug or chatSessionId`);
      return null;
    }
    try {
      const model =
        args.model ??
        listConnections().find((c) => c.slug === args.connectionSlug)?.defaultModel ??
        PI_COMMIT_MODEL;
      const result = await runPiMiniCompletion({
        connectionSlug: args.connectionSlug,
        auth: args.auth,
        piAuthProvider: (args.piAuthProvider ?? 'github-copilot') as import('./backends/pi/protocol').PiAuthProvider,
        chatSessionId: args.chatSessionId,
        chatSessionPath: sessionPath(args.chatSessionId),
        cwd: args.cwd,
        model,
        systemPrompt: SYSTEM_PROMPT,
        userPrompt,
        maxTokens: COMMIT_MAX_TOKENS,
      });
      if (result.error || !result.text) {
        log.warn(`[copilot_oauth] mini_completion error: ${result.error ?? 'empty response'}`);
        return null;
      }
      return validateCommitMessage(result.text);
    } catch (e) {
      log.warn(`[copilot_oauth] threw: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }

  if (!locateClaudeCli()) {
    log.warn('claude CLI not found');
    return null;
  }
  const authType: string = args.auth.type;
  if (authType !== 'anthropic_api_key' && authType !== 'anthropic_oauth') {
    log.warn(`unsupported auth type: ${authType}`);
    return null;
  }

  const anthropicAuth: AnthropicAuth = args.auth;
  const options = {
    ...getDefaultOptions({ envOverrides: envForAnthropicAuth(anthropicAuth) }),
    model: args.model ?? ANTHROPIC_COMMIT_MODEL,
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
    for await (const msg of query({ prompt: userPrompt, options }) as AsyncIterable<SDKMessage>) {
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
    return validateCommitMessage(collected);
  } catch (e) {
    log.warn(`[anthropic] threw: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

function envForAnthropicAuth(auth: AnthropicAuth): Record<string, string> {
  return auth.type === 'anthropic_api_key'
    ? { ANTHROPIC_API_KEY: auth.apiKey }
    : { CLAUDE_CODE_OAUTH_TOKEN: auth.accessToken };
}
