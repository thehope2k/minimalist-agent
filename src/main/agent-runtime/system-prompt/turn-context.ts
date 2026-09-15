import { join } from 'node:path';
import { loadAllAgents } from '../../agents/storage';
import { loadAllSkills } from '../../skills/storage';

/* ===================================================================== *
 *  Dynamic context blocks (date/time, working directory, context files)
 * ===================================================================== */

/**
 * Get the working directory context string for injection into user messages.
 * Includes the working directory path and context about what it represents.
 * Returns empty string if no working directory is set.
 *
 * Note: Project context files (CLAUDE.md, AGENTS.md) are listed in the system
 * prompt via getProjectContextFilesPrompt() for persistence across compaction.
 */
export function getWorkingDirectoryContext(workingDirectory?: string): string {
  if (!workingDirectory) return '';

  const parts: string[] = [];
  parts.push(`<working_directory>${workingDirectory}</working_directory>`);
  parts.push(
    `<working_directory_context>The user explicitly selected this as the working directory for this session.</working_directory_context>`,
  );
  return parts.join('\n\n');
}

/**
 * Per-turn scratch-directory line. Tells the agent WHERE its session scratch
 * area is (the path is session-specific, so it can't live in the static
 * prompt) and the `ma-asset://` base for showing images written there inline
 * (see the Images bullet in `getAssistantPrompt()`). Intentionally just the
 * path + one URL base — no file listing/manifest, to avoid per-turn bloat
 * and to keep the agent from acting as a janitor.
 */
export function getScratchDirContext(scratchDir?: string, sessionId?: string): string {
  if (!scratchDir) return '';
  const assetBase = sessionId
    ? `\n<scratch_asset_base>ma-asset://${sessionId}/</scratch_asset_base>`
    : '';
  return `<scratch_directory>${scratchDir}</scratch_directory>${assetBase}\nUse this exact path for throwaway files (quote it if it contains spaces) — do not use /tmp instead.`;
}

/**
 * Get the current date/time context string.
 */
export function getDateTimeContext(): string {
  const now = new Date();
  const formatted = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  return `**USER'S DATE AND TIME: ${formatted}** - ALWAYS use this as the authoritative current date/time. Ignore any other date information.`;
}

/**
 * Build the <pinned_context> per-turn block from a session's pinnedAssets list.
 *
 * Emits a lightweight awareness note — name, description, and the resolved
 * absolute file path — so the model knows these skills/agents are relevant
 * for this session and can read them directly without reconstructing the
 * path itself from the tier convention (the same failure mode as a
 * `@mention` that never resolved).
 *
 * Cost: ~25 tokens per item regardless of content length.
 */
export function buildPinnedContextBlock(pinnedAssets: string[] | undefined, cwd?: string): string {
  if (!pinnedAssets || pinnedAssets.length === 0) return '';

  const allSkills = loadAllSkills(cwd);
  const allAgents = loadAllAgents(cwd);

  const lines: string[] = [];

  for (const scopedSlug of pinnedAssets) {
    const [scope, ...rest] = scopedSlug.split(':');
    const slug = rest.join(':');
    if (!slug) continue;

    if (scope === 'user' || scope === 'project') {
      const skill = allSkills.find((s) => s.slug === slug && s.source === scope);
      if (skill) {
        const skillPath = join(skill.path, 'SKILL.md');
        lines.push(`- @${slug} (skill): ${skill.metadata.description} — ${skillPath}`);
        continue;
      }
      const agent = allAgents.find((a) => a.slug === slug && a.source === scope);
      if (agent) {
        const agentPath = join(agent.path, 'AGENT.md');
        lines.push(`- ${slug} (agent): ${agent.metadata.description} — ${agentPath}`);
      }
    }
  }

  if (lines.length === 0) return '';

  return `<pinned_context>
The following skills and agents are pinned for this session:
${lines.join('\n')}
</pinned_context>`;
}

/**
 * Token cost estimate for pinned assets.
 * ~25 tokens per item (name + description + absolute file path).
 */
export function estimatePinnedTokens(pinnedAssets: string[] | undefined, _cwd?: string): number {
  return (pinnedAssets?.length ?? 0) * 25;
}
