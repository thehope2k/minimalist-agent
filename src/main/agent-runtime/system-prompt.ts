// System prompt assembly. The emitted prompt = getSystemPrompt() (static) +
// buildPromptPrefix() (per-turn). For the full inventory of every block, what
// the app actually exposes, and the rules for changing any of it, see
// docs/SYSTEM-PROMPT.md — keep that doc in sync with this file.

import { formatPreferencesForPrompt, getCoAuthorPreference } from '../storage/preferences';
import { findProjectForPath } from '../storage/projects';
import { formatExtensionsAwareness } from '../extensions/directive';

import { getCollaborationGuidance } from './collaboration-prompt';
import {
  getArtifactPolicy,
  getAssistantPrompt,
  resolveProviderDescription,
} from './system-prompt/assistant-body';
import {
  findAllProjectContextFiles,
  getProjectContextFilesPrompt,
  invalidateContextFileCache,
} from './system-prompt/project-context';
import { getPlanningGuidance } from './planning-prompt';
import {
  getAgentsAwarenessBlock,
  invalidateAgentsPromptCache,
} from './system-prompt/agent-awareness';
import { formatActivePlanContext } from './system-prompt/plan-context';
import {
  buildPinnedContextBlock,
  estimatePinnedTokens,
  getDateTimeContext,
  getScratchDirContext,
  getWorkingDirectoryContext,
} from './system-prompt/turn-context';
import { getActivePlan } from './plan-cache';

export {
  buildPinnedContextBlock,
  estimatePinnedTokens,
  findAllProjectContextFiles,
  getDateTimeContext,
  getProjectContextFilesPrompt,
  getScratchDirContext,
  getWorkingDirectoryContext,
  invalidateAgentsPromptCache,
  invalidateContextFileCache,
};

/* ===================================================================== *
 *  Public API
 * ===================================================================== */

/** Options for getSystemPrompt — mirrors the comprehensive harness signature. */
export interface SystemPromptOptions {
  workingDirectory?: string;
  includeCoAuthoredBy?: boolean;
  sessionId?: string;
  userMessage?: string;
  authType?: string;
  provider?: string;
  model?: string;
  autonomyLevel?: number;
}

/**
 * Get the full system prompt. Returns the static text appended per-turn via
 * `buildPromptPrefix()`.
 *
 * Date/time and working-directory context are NOT included here — they are
 * injected per user message via `buildPromptPrefix()` so the system prompt
 * stays static and cacheable.
 */
export function getSystemPrompt(opts: SystemPromptOptions = {}): string {
  const projectCoAuthor = findProjectForPath(opts.workingDirectory)?.includeCoAuthoredBy;
  const includeCoAuthoredBy =
    opts.includeCoAuthoredBy ?? projectCoAuthor ?? getCoAuthorPreference();
  const preferences = formatPreferencesForPrompt();
  const userPreferences = preferences ? `\n\n${preferences}` : '';
  const projectContextFiles = getProjectContextFilesPrompt(opts.workingDirectory);
  const artifactPolicy = getArtifactPolicy();
  const providerDescription = resolveProviderDescription(opts.authType, opts.provider, opts.model);
  const basePrompt = getAssistantPrompt(includeCoAuthoredBy, providerDescription);

  // Collaboration system guidance — teaches LLM when to engage user
  const autonomyLevel = opts.autonomyLevel ?? 50; // Default: balanced
  const collaborationBlock = getCollaborationGuidance(autonomyLevel);

  // Planning workflow guidance — teaches LLM when and how to use planning
  const planningBlock = getPlanningGuidance();

  // Active plan context — injects current phase awareness when plan is active
  let planContextBlock = '';
  if (opts.sessionId) {
    const activePlan = getActivePlan(opts.sessionId);
    if (activePlan && activePlan.status === 'active') {
      planContextBlock = formatActivePlanContext(activePlan);
    }
  }

  const agentsBlock = getAgentsAwarenessBlock();

  return `${basePrompt}${userPreferences}${projectContextFiles}\n\n${artifactPolicy}${collaborationBlock ? `\n\n${collaborationBlock}` : ''}${planningBlock ? `\n\n${planningBlock}` : ''}${planContextBlock ? `\n\n${planContextBlock}` : ''}${agentsBlock ? `\n\n${agentsBlock}` : ''}`;
}

/**
 * Convenience wrapper used by the agent runtime. Accepts the working
 * directory under its conventional name and forwards everything else to
 * `getSystemPrompt`.
 */
export function buildSystemPromptAppend(input: {
  cwd?: string;
  includeCoAuthoredBy?: boolean;
  sessionId?: string;
  userMessage?: string;
  /** Resolved auth type — forwarded to resolveProviderDescription(). */
  authType?: string;
  /** Model provider — forwarded to resolveProviderDescription(). */
  provider?: string;
  /** Active model ID — forwarded to resolveProviderDescription(). */
  model?: string;
  /** User's autonomy level (0-100) — forwarded to collaboration system. */
  autonomyLevel?: number;
}): string {
  return getSystemPrompt({
    workingDirectory: input.cwd,
    includeCoAuthoredBy: input.includeCoAuthoredBy,
    sessionId: input.sessionId,
    userMessage: input.userMessage,
    authType: input.authType,
    provider: input.provider,
    model: input.model,
    autonomyLevel: input.autonomyLevel,
  });
}

/**
 * Returns the dynamic context block prepended to each user message
 * (date/time + working directory). Empty string when neither applies.
 *
 * Kept out of the system prompt so per-turn changes don't bust the cache.
 */
export function buildPromptPrefix(input: {
  cwd?: string;
  scratchDir?: string;
  sessionId?: string;
  pinnedAssets?: string[];
}): string {
  const blocks: string[] = [];
  blocks.push(getDateTimeContext());
  const wd = getWorkingDirectoryContext(input.cwd);
  if (wd) blocks.push(wd);
  const scratch = getScratchDirContext(input.scratchDir, input.sessionId);
  if (scratch) blocks.push(scratch);
  const ext = formatExtensionsAwareness(input.cwd);
  if (ext) blocks.push(ext);
  const pinned = buildPinnedContextBlock(input.pinnedAssets, input.cwd);
  if (pinned) blocks.push(pinned);
  return blocks.join('\n\n');
}
