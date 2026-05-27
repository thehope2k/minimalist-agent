// One-shot AI call to generate a conventional commit message from a diff summary.
// Reuses generateTitle's provider-aware infrastructure (Anthropic SDK + Pi mini_completion)
// but with a commit-focused system prompt and larger token budget.

import { query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { getDefaultOptions, locateClaudeCli } from './options';
import type { AnthropicAuth, ResolvedAuth } from './claude';
import { runPiMiniCompletion } from './backends/pi/agent';
import { sessionPath } from '../storage/sessions';

const ANTHROPIC_HAIKU  = 'claude-haiku-4-5-20251001';
const PI_DEFAULT_MINI  = 'claude-haiku-4.5';
const COMMIT_MAX_TOKENS = 1500;

const SYSTEM_PROMPT = `You are a git commit message generator for professional software engineers.

FORMAT:
  <type>(<scope>): <description>   ← max 72 chars, required
  <blank line>
  <body>                           ← optional, only for complex changes

TYPES: feat, fix, refactor, docs, chore, style, test, perf, build, ci

RULES:
- First line: specific and technical — name the key concept, feature, or component.
- Body: short prose; omit when the first line is self-explanatory.
  For changesets touching 4+ files or covering multiple concerns, a concise body
  IS expected — summarise what was added, changed, or fixed at a high level.

USER CONTEXT PRIORITY:
  When the user provides context about the change's purpose (e.g., "fix login timeout",
  "add dark mode support"), use it to:
  1. ACCURATELY choose the commit type (fix/feat/refactor/etc.) — user intent overrides code inference
  2. Identify the scope and affected component
  3. Frame the description from the user's perspective
  
  Example: If user says "fix login bug" but the diff shows new features,
  recognize it's actually fixing broken functionality → type = "fix", not "feat".

MULTI-REPO RULE (when changes span multiple repositories):
  Write ONE message at the product/feature/business level — what shared purpose
  do ALL repos serve? Do NOT list repo names, do NOT add per-repo sections.
  The message should be meaningful when committed to ANY of the repos individually.
  Example: if frontend adds OAuth UI and backend adds OAuth endpoints, write
  "feat(auth): implement OAuth login" — not "frontend: ..., backend: ...".

AMEND RULE:
  You are amending an existing commit. The previous message and its diff are shown
  for context. If ADDITIONAL STAGED CHANGES are present, you MUST produce a new
  message that covers BOTH the original commit AND the new changes as a single
  coherent whole. Do not reproduce the old message unchanged — synthesize a
  new message that describes the complete final state of the commit.
  If there are no additional staged changes, keep the original message as-is.

Reply with ONLY the commit message. No preamble, no explanations, no markdown, no quotes.`;

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

/** Strip preambles, keep multi-line structure intact (unlike validateTitle). */
function validateCommitMessage(raw: string): string | null {
  let s = raw.trim();
  if (!s) return null;

  // Strip wrapping quotes.
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  // Strip conversational preambles ("Here's a commit message:", "Sure!", etc.)
  s = s.replace(
    /^(here(?:'s| is)(?: a| the)?(?:\s+(?:suggested|conventional|commit))?\s+(?:commit\s+)?(?:message)?|sure|of course|certainly|ok(?:ay)?)\s*[:,\-—!.]?\s*/i,
    '',
  ).trim();

  // Hard cap: 1200 chars (generous for type + body).
  if (s.length > 1200) s = s.slice(0, 1200).trimEnd();

  return s || null;
}

export async function generateCommitMessage(
  args: GenerateCommitMessageArgs,
): Promise<string | null> {
  if (!args.diffContext.trim()) return null;

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

  if (args.auth.type === 'copilot_oauth') {
    if (!args.connectionSlug || !args.chatSessionId) return null;
    try {
      const result = await runPiMiniCompletion({
        connectionSlug: args.connectionSlug,
        auth: args.auth,
        piAuthProvider: (args.piAuthProvider ?? 'github-copilot') as import('./backends/pi/protocol').PiAuthProvider,
        chatSessionId: args.chatSessionId,
        chatSessionPath: sessionPath(args.chatSessionId),
        cwd: args.cwd,
        model: args.model ?? PI_DEFAULT_MINI,
        systemPrompt: SYSTEM_PROMPT,
        userPrompt,
        maxTokens: COMMIT_MAX_TOKENS,
      });
      if (result.error || !result.text) return null;
      return validateCommitMessage(result.text);
    } catch {
      return null;
    }
  }

  if (!locateClaudeCli()) return null;
  if (args.auth.type !== 'anthropic_api_key' && args.auth.type !== 'anthropic_oauth') return null;

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
  } catch {
    return null;
  }
}

function envForAnthropicAuth(auth: AnthropicAuth): Record<string, string> {
  return auth.type === 'anthropic_api_key'
    ? { ANTHROPIC_API_KEY: auth.apiKey }
    : { CLAUDE_CODE_OAUTH_TOKEN: auth.accessToken };
}
