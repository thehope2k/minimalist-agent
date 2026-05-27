import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildSddSkillBlock } from './bundled-skill';
import { SPECKIT_VERSION } from './version';
import { getState } from './session-state';
import { deriveEntityPhase } from './phase';
import type { SddFeature } from './types';

// ── SDD keyword detection ─────────────────────────────────────────────────────

/**
 * Patterns that signal SDD intent. More specific than simple keyword matching
 * to reduce false positives from common words like "plan", "task", "implement".
 * When any pattern matches, the full rules block is injected even when an
 * active feature is pinned (lazy injection mode).
 */
const SDD_PATTERNS = [
  // Exact SpecKit terms
  /\bspeckit\b/i,
  /\/speckit\b/i,
  
  // File references (strong signal)
  /constitution\.md/i,
  /spec\.md/i,
  /plan\.md/i,
  /tasks\.md/i,
  /\.specify\//i,
  
  // SpecKit commands
  /specify\s+(init|status|next|build|implement|integration)/i,
  
  // Intent phrases with action verbs + SDD artifacts
  /(?:create|write|update|edit|review|delete|remove)\s+(?:the\s+)?(?:spec|plan|constitution|task)/i,
  /(?:add|generate|build)\s+(?:a\s+)?(?:spec|plan|constitution)/i,
  
  // Phase-related (but only when combined with SDD context)
  /(?:specify|specification)\s+phase/i,
  /\bconstitution\b/i, // "constitution" alone is specific enough
];

/** Track keyword detection stats for telemetry */
interface SddKeywordStats {
  totalChecks: number;
  totalMatches: number;
  patternMatches: Map<number, number>; // pattern index -> match count
}

const keywordStats: SddKeywordStats = {
  totalChecks: 0,
  totalMatches: 0,
  patternMatches: new Map(),
};

function messageHasSddKeyword(message: string): boolean {
  keywordStats.totalChecks++;
  
  for (let i = 0; i < SDD_PATTERNS.length; i++) {
    if (SDD_PATTERNS[i].test(message)) {
      keywordStats.totalMatches++;
      keywordStats.patternMatches.set(
        i,
        (keywordStats.patternMatches.get(i) ?? 0) + 1
      );
      return true;
    }
  }
  
  return false;
}

/**
 * Get SDD keyword detection statistics for monitoring.
 * Useful for tuning the patterns and detecting false positive rates.
 */
export function getSddKeywordStats() {
  return {
    totalChecks: keywordStats.totalChecks,
    totalMatches: keywordStats.totalMatches,
    matchRate: keywordStats.totalChecks > 0
      ? ((keywordStats.totalMatches / keywordStats.totalChecks) * 100).toFixed(1) + '%'
      : '0%',
    patternBreakdown: Array.from(keywordStats.patternMatches.entries()).map(
      ([idx, count]) => ({
        pattern: SDD_PATTERNS[idx].source,
        matches: count,
      })
    ),
  };
}

/** Reset stats (useful for testing) */
export function resetSddKeywordStats() {
  keywordStats.totalChecks = 0;
  keywordStats.totalMatches = 0;
  keywordStats.patternMatches.clear();
}

// ── Context block builders ────────────────────────────────────────────────────

/**
 * Lean context block for a single pinned feature.
 * Kept deliberately small (~40 tokens) to minimise per-turn overhead.
 */
function buildLeanContext(feature: SddFeature, entityRootPath: string): string {
  const artifacts: string[] = [];
  if (feature.artifacts.hasSpec) artifacts.push('spec.md');
  if (feature.artifacts.hasPlan) artifacts.push('plan.md');
  if (feature.artifacts.hasTasks) artifacts.push('tasks.md');
  if (feature.artifacts.extraArtifacts.length > 0) {
    artifacts.push(...feature.artifacts.extraArtifacts);
  }

  const artifactLine = artifacts.length ? artifacts.join(', ') : 'none yet';

  let tasksLine = '—';
  if (feature.artifacts.hasTasks && feature.artifacts.taskCount > 0) {
    const checked = Math.round(
      feature.artifacts.taskCompletionRatio * feature.artifacts.taskCount,
    );
    tasksLine = `${checked}/${feature.artifacts.taskCount} done`;
  }

  // Use the absolute feature path so the agent can read/write files without
  // having to guess the entity root. When the session cwd is a parent repo
  // (monorepo / workspace), a relative-to-entity-root path would be resolved
  // from cwd by the agent — yielding the wrong location.
  const featurePath = feature.path;

  // Build explicit artifact paths for the artifacts that already exist so the
  // agent can read them directly without a discovery step.
  const artifactPaths: string[] = [];
  if (feature.artifacts.hasSpec) artifactPaths.push(`${featurePath}/spec.md`);
  if (feature.artifacts.hasPlan) artifactPaths.push(`${featurePath}/plan.md`);
  if (feature.artifacts.hasTasks) artifactPaths.push(`${featurePath}/tasks.md`);
  for (const extra of feature.artifacts.extraArtifacts) {
    artifactPaths.push(`${featurePath}/${extra}`);
  }

  const artifactPathsBlock = artifactPaths.length
    ? '\nArtifact paths:\n' + artifactPaths.map((p) => `  ${p}`).join('\n')
    : '';

  return `
<sdd_context>
Active feature: ${feature.name} (${feature.currentPhase} phase)
Entity root: ${entityRootPath}
Feature path: ${featurePath}
Artifacts: ${artifactLine}${artifactPathsBlock}
Tasks: ${tasksLine}
</sdd_context>`;
}

/**
 * Full context block listing all features of the active entity.
 * Used when no feature is pinned (backward-compatible behaviour).
 */
function buildFullContext(
  entityName: string,
  specifyPath: string,
  hasConstitution: boolean,
  features: readonly SddFeature[],
  phase: string,
): string {
  const MAX_FEATURES = 5;
  const shown = features.slice(0, MAX_FEATURES);
  const hidden = features.length - shown.length;

  const lines = shown.map((f) => {
    const parts: string[] = [];
    if (f.artifacts.hasSpec) parts.push('spec.md');
    if (f.artifacts.hasPlan) parts.push('plan.md');
    if (f.artifacts.hasTasks) {
      const { taskCount, taskCompletionRatio } = f.artifacts;
      const progress = taskCount > 0
        ? ` (${Math.round(taskCompletionRatio * taskCount)}/${taskCount} tasks done)`
        : ' (0 tasks)';
      parts.push(`tasks.md${progress}`);
    }
    if (f.artifacts.extraArtifacts.length > 0) parts.push(...f.artifacts.extraArtifacts);
    // Include absolute path so the agent can locate files even when the entity
    // is not at the session cwd root (monorepo / nested workspace layouts).
    return `  - ${f.name}: ${parts.length ? parts.join(', ') : 'no artifacts yet'} [${f.path}]`;
  });

  if (hidden > 0) {
    lines.push(`  ... and ${hidden} more feature${hidden > 1 ? 's' : ''} (run \`ls specs/\` to see all)`);
  }

  return `
<sdd_context>
Active SDD entity: ${entityName} (${specifyPath})
Current phase: ${phase}
Constitution: ${hasConstitution ? 'exists' : 'missing'}
Features (${features.length} total):
${lines.join('\n') || '  (none yet)'}
</sdd_context>`;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build the SDD context block appended to the system prompt each turn.
 * Returns '' when SDD mode is Off, no entities found, or sessionId missing.
 *
 * When an active feature is pinned (or the entity has exactly one feature):
 *   - Injects a lean <sdd_context> block for that feature only (~40 tokens).
 *   - Injects the full SDD rules block only on the first turn or when the
 *     user message contains an SDD keyword (lazy injection).
 *
 * When no feature is pinned:
 *   - Falls back to the original behaviour: full rules + all features listed.
 *
 * Uses the detected CLI version (from scan) rather than the hardcoded
 * SPECKIT_VERSION so the coaching text stays accurate after CLI upgrades.
 *
 * Skips the static skill directive when the Pi integration skill file is
 * already present in the entity (.pi/skills/speckit.md created by
 * `specify integration add pi`) to avoid injecting duplicate instructions.
 */
export function buildSddPromptBlock(
  sessionId: string | undefined,
  userMessage?: string,
): string {
  if (!sessionId) return '';

  const state = getState(sessionId);
  if (!state || state.mode === 'off' || state.entities.length === 0) return '';

  // Increment turn counter before any early returns so it stays accurate.
  const currentTurn = state.turnCount;
  state.turnCount += 1;

  const version = state.cliVersion ?? SPECKIT_VERSION;

  const activeRoot = state.activeEntityRootPath;
  const activeEntity = state.entities.find((e) => e.rootPath === activeRoot)
    ?? (state.entities.length === 1 ? state.entities[0] : null);

  // ── Resolve the effective active feature ──────────────────────────────────
  // Priority: pinned slug → single-feature implicit → none
  let pinnedFeature: SddFeature | null = null;

  if (state.activeFeatureSlug && activeEntity) {
    pinnedFeature = activeEntity.features.find(
      (f) => f.name === state.activeFeatureSlug || f.slug === state.activeFeatureSlug,
    ) ?? null;
  } else if (activeEntity?.features.length === 1) {
    // Single-feature entity: treat as implicitly pinned.
    pinnedFeature = activeEntity.features[0];
  }

  // ── Skill block (rules) ────────────────────────────────────────────────────
  const entityForSkillCheck = activeEntity;
  const skillAlreadyInstalled =
    entityForSkillCheck != null &&
    existsSync(join(entityForSkillCheck.rootPath, '.pi', 'skills', 'speckit.md'));

  let skillBlock = '';
  if (!skillAlreadyInstalled) {
    if (pinnedFeature) {
      // Lazy injection: only inject rules on first turn or SDD-keyword message.
      const isFirstTurn = currentTurn === 0;
      const hasSddKeyword = userMessage ? messageHasSddKeyword(userMessage) : false;
      if (isFirstTurn || hasSddKeyword) {
        skillBlock = buildSddSkillBlock(version);
      }
    } else {
      // No pin — backward-compatible: always inject rules.
      skillBlock = buildSddSkillBlock(version);
    }
  }

  // ── Context block ──────────────────────────────────────────────────────────
  let phaseContext = '';

  if (pinnedFeature) {
    phaseContext = buildLeanContext(pinnedFeature, activeEntity?.rootPath ?? '');
  } else if (activeEntity) {
    const phase = deriveEntityPhase(activeEntity.features, activeEntity.hasConstitution);
    phaseContext = buildFullContext(
      activeEntity.name,
      activeEntity.specifyPath,
      activeEntity.hasConstitution,
      activeEntity.features,
      phase,
    );
  }

  return `${skillBlock}${phaseContext}`;
}
