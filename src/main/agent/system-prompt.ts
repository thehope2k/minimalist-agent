// System prompt assembly. Ported as closely as possible from a comprehensive
// agent harness (helpers, prompt structure, and prose for the sections that
// apply are kept verbatim). Sections referencing capabilities this app does
// not expose — permission modes, spreadsheet / html-preview /
// pdf-preview / image-preview rendering, browser tools, session-management
// tools, document CLIs, call_llm, transform_data, render_template,
// developer feedback — are omitted to keep the prompt honest about what
// the model can actually do. Skills, extensions (MCP/CLI/guide-only),
// mermaid, json, and datatable rendering ARE supported and have their
// own sections below.

import type {Dirent} from 'node:fs';
import {readdirSync, statSync} from 'node:fs';
import {hostname, release} from 'node:os';
import {join, sep} from 'node:path';
import {formatPreferencesForPrompt, getCoAuthorPreference,} from '../storage/preferences';
import { findProjectForPath } from '../storage/projects';
import {formatExtensionsAwareness} from '../extensions/directive';
import { buildSddPromptBlock } from '../sdd/system-prompt';
import { getCollaborationGuidance } from './collaboration-prompt';
import { loadAllAgents } from '../agents/storage';
import { getSettings, DEFAULT_CONTEXT_FILE_NAMES } from '../storage/settings';

/* ===================================================================== *
 * Project context-file discovery (AGENTS.md / CLAUDE.md)
 * ===================================================================== */

/** Maximum number of context files to discover in monorepo. */
const MAX_CONTEXT_FILES = 30;

/** Maximum directory depth when walking for context files. */
const MAX_WALK_DEPTH = 6;

/**
 * Directories to exclude when searching for context files.
 * These are common build output, dependency, and cache directories.
 */
const EXCLUDED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage',
  'vendor',
  '.cache',
  '.turbo',
  'out',
  '.output',
  '.venv',
  'venv',
  '__pycache__',
  '.pytest_cache',
  'target',
  '.gradle',
]);

// ── Context file cache ──────────────────────────────────────────────────
// The recursive walk is expensive in large monorepos. The result (a list of
// file paths like "CLAUDE.md", "apps/electron/CLAUDE.md") rarely changes
// during a session, so we cache it per working directory with a 5-minute
// safety TTL. Explicit invalidation happens on working directory changes.

const contextFileCache = new Map<string, { files: string[]; ts: number }>();
const CONTEXT_FILE_CACHE_TTL = 5 * 60_000; // 5 minutes

/** Invalidate the cached context file list for a directory (or all directories). */
export function invalidateContextFileCache(directory?: string): void {
  if (directory) contextFileCache.delete(directory);
  else contextFileCache.clear();
}

/**
 * Recursive walker that respects EXCLUDED_DIRECTORIES, caps depth, and is
 * case-insensitive for the trailing filename. Returns paths relative to
 * `root`, sorted by depth then alphabetically. Capped at MAX_CONTEXT_FILES.
 *
 * (Equivalent to `globSync('**\u200b/{agents,claude}.md', { nocase: true, ignore: \u2026 })`
 * — implemented with `fs.readdirSync({ withFileTypes: true })` so we don't
 * need to add a `glob` dependency.)
 */
function walkForContextFiles(root: string): string[] {
  const configuredNames = getSettings().contextFileNames ?? DEFAULT_CONTEXT_FILE_NAMES;
  const fileSet = new Set(configuredNames.map((n) => n.toLowerCase()));
  const matches: string[] = [];
  const visit = (dir: string, depth: number): void => {
    if (matches.length >= MAX_CONTEXT_FILES) return;
    if (depth > MAX_WALK_DEPTH) return;
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true }) as Dirent[];
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isFile()) continue;
      if (fileSet.has(e.name.toLowerCase())) {
        const abs = join(dir, e.name);
        const rel = abs === join(root, e.name)
          ? e.name
          : abs.startsWith(root + sep)
            ? abs.slice(root.length + 1)
            : abs;
        matches.push(rel);
        if (matches.length >= MAX_CONTEXT_FILES) return;
      }
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (EXCLUDED_DIRECTORIES.has(e.name)) continue;
      visit(join(dir, e.name), depth + 1);
    }
  };
  visit(root, 0);
  return matches;
}

/**
 * Find all project context files (AGENTS.md or CLAUDE.md) recursively in a directory.
 * Supports monorepo setups where each package may have its own context file.
 * Returns relative paths sorted by depth (root first), capped at MAX_CONTEXT_FILES.
 *
 * Results are cached per directory. Call invalidateContextFileCache() on working
 * directory changes. A 5-minute TTL acts as a safety net for cache staleness.
 */
export function findAllProjectContextFiles(directory: string): string[] {
  if (!directory) return [];
  try {
    if (!statSync(directory).isDirectory()) return [];
  } catch {
    return [];
  }

  // Check cache first
  const now = Date.now();
  const cached = contextFileCache.get(directory);
  if (cached && now - cached.ts < CONTEXT_FILE_CACHE_TTL) {
    return cached.files;
  }

  try {
    const matches = walkForContextFiles(directory);

    if (matches.length === 0) {
      contextFileCache.set(directory, { files: [], ts: now });
      return [];
    }

    // Sort by depth (fewer slashes = shallower = higher priority), then alphabetically.
    // Root files come first, then nested packages.
    const sorted = matches.sort((a, b) => {
      const depthA = (a.match(/\//g) || []).length;
      const depthB = (b.match(/\//g) || []).length;
      if (depthA !== depthB) return depthA - depthB;
      return a.localeCompare(b);
    });

    // Cap at max files to avoid overwhelming the prompt.
    const capped = sorted.slice(0, MAX_CONTEXT_FILES);

    contextFileCache.set(directory, { files: capped, ts: now });
    return capped;
  } catch {
    return [];
  }
}
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
 * Get the project context files prompt section for the system prompt.
 * Lists all discovered context files (AGENTS.md, CLAUDE.md) in the working directory.
 * For monorepos, this includes nested package context files.
 * Returns empty string if no working directory or no context files found.
 */
export function getProjectContextFilesPrompt(workingDirectory?: string): string {
  if (!workingDirectory) return '';

  const contextFiles = findAllProjectContextFiles(workingDirectory);
  if (contextFiles.length === 0) return '';

  // Format file list with (root) annotation for top-level files.
  const fileList = contextFiles
    .map((file) => {
      const isRoot = !file.includes('/') && !file.includes(sep);
      return `- ${file}${isRoot ? ' (root)' : ''}`;
    })
    .join('\n');

  return `
<project_context_files working_directory="${workingDirectory}">
${fileList}
</project_context_files>`;
}

/* ===================================================================== *
 *  Provider description (dynamic, injected into the assistant identity)
 * ===================================================================== */

/**
 * Map auth type + Pi sub-provider onto a human-readable provider string that
 * the model uses when asked "what model are you?".
 *
 * Kept intentionally short so it reads naturally inside the prompt.
 */
export function resolveProviderDescription(
  authType?: string,
  piAuthProvider?: string,
  model?: string,
): string {
  const modelSuffix = model ? ` (${model})` : '';
  switch (authType) {
    case 'anthropic_api_key':
    case 'anthropic_oauth':
      return 'Claude Code (Anthropic)';
    case 'copilot_oauth':
      if (piAuthProvider === 'openai-codex') {
        return `ChatGPT Plus / OpenAI${modelSuffix}`;
      }
      return `GitHub Copilot${modelSuffix}`;
    case 'local_api':
      return `a local model server${model ? ` — ${model}` : ''}`;
    default:
      // Fallback: stay honest but non-specific rather than lie.
      return 'Claude Code';
  }
}

/* ===================================================================== *
 *  Static assistant body (appended to the claude_code preset)
 * ===================================================================== */

/**
 * Environment marker embedded in the system prompt — useful for SDK JSONL
 * detection and forensics if a session is ever exported.
 */
function getEnvironmentMarker(): string {
  return `<minimalist_agent_environment platform="${process.platform}" arch="${process.arch}" os_version="${release()}" host="${hostname()}" />`;
}

/**
 * Get the assistant system prompt body.
 *
 * This prompt is intentionally concise — detailed guidance lives in the
 * project's own AGENTS.md / CLAUDE.md and is read on-demand when topics
 * come up.
 *
 * @param includeCoAuthoredBy - Whether to include the Co-Authored-By git trailer instruction (default: true)
 * @param providerDescription - Human-readable provider string injected into the identity line (default: 'Claude Code')
 */
function getAssistantPrompt(
  includeCoAuthoredBy: boolean = true,
  providerDescription: string = 'Claude Code',
): string {
  const environmentMarker = getEnvironmentMarker();

  return `${environmentMarker}

You are Minimalist Agent — an AI coding assistant that helps users understand, change, and operate on the files in their working directory through a desktop chat interface.

**Core capabilities:**
- **Code** — You are powered by ${providerDescription}, so you can read, write, and edit files; run shell commands; search by content or filename; fetch and search the web; and spawn focused sub-agents for parallel work.
- **Project awareness** — You read \`AGENTS.md\` / \`CLAUDE.md\` to learn project conventions before making non-trivial changes.
- **Skills** — Reusable instruction files (\`SKILL.md\`) the user can invoke with \`@slug\` to give you specialized behavior on demand.
- **Extensions** — Installed capabilities (MCP servers, bundled CLIs, or pure usage guides) that expand what you can do beyond the built-in tools.
- **Diagrams** — You can render Mermaid diagrams natively for architecture, flow, and structure visualizations.
- **Math** — KaTeX renders \`$$...$$\` expressions and \`\`\`latex\` blocks as typeset equations.
- **Rich code blocks** — \`\`\`json\` renders as an interactive collapsible tree; all code blocks have an expand-to-fullscreen button.

## Read-First Policy

When the runtime provides a directive listing files to read (skills, extensions, or mentioned files):
1. **Read ALL listed files** using the Read tool BEFORE taking any other action
2. Do not proceed until you've read every file
3. If a file is missing or inaccessible, report it before continuing

## Project Context

When \`<project_context_files>\` appears, it lists discovered context files (CLAUDE.md, AGENTS.md) in the working directory and subdirectories. Supports monorepos with per-package context.

Read context files using the Read tool — they contain architecture, conventions, and guidance.

## Skills

Skills are reusable instruction sets. Each is a directory with a \`SKILL.md\` file (YAML frontmatter + markdown instructions).

**Storage:** \`<userData>/skills/{slug}/SKILL.md\` (global, not per-project)

**Invocation:** Users mention \`@slug\` (e.g. \`@code-review\`). Runtime provides a directive listing paths to read.

**Unmatched mentions:** Treat \`@unknown\` as a typo or plain mention. Don't fabricate behavior.

## Extensions

Extensions add capabilities beyond built-in tools. Each is a directory under \`<userData>/extensions/{slug}/\` with:
- \`extension.json\` — config
- \`guide.md\` — usage instructions

**Three types:** MCP-backed (exposes tools), CLI-bound (wraps CLI), guide-only (docs).

**Awareness block:** Each turn, runtime prepends \`<extensions>\` block listing extensions with \`guide.md\` paths. Read the guide before using an extension for the first time in a session.

**Disabled extensions:** Appear in awareness but cannot be invoked. Suggest re-enabling if asked.

## Diagrams (Mermaid)

You can render **Mermaid diagrams natively** as themed SVGs by emitting a fenced code block with the \`mermaid\` language tag. Use diagrams whenever they would clarify structure better than prose:
- Architecture, module relationships, data flow
- State machines, sequences, ER diagrams, class hierarchies
- Before/after comparisons in refactors
- Trends and comparisons via \`xychart-beta\`

**Example:**
\`\`\`mermaid
graph LR
    A[Input] --> B{Process}
    B --> C[Output]
\`\`\`

**Tips:**
- Prefer Mermaid over ASCII art for diagrams
- One concept per diagram; split large ones
- Horizontal (\`LR\`) for small, vertical (\`TD\`) for large diagrams
- Renderer shows source while streaming or on syntax errors

## Math

You can render **math expressions natively via KaTeX**.

**Inline:** $$E = mc^2$$ (double-dollar, no spaces)

**Block:**
$$
\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}
$$

Use for algorithms, complexity, ML concepts, formulas.

## Rich Code Blocks

Beyond standard syntax-highlighted code, two fenced-block languages render as interactive widgets:

### JSON — interactive tree viewer
\`\`\`json blocks render as a **collapsible tree**. Use for API responses, config objects, structured data, or JSON >5 lines.

### Expand button on all code blocks
Every code block has an **Expand** button for fullscreen view.

## Interaction Guidelines

1. **Be Concise**: Provide focused, actionable responses.
2. **Show Progress**: Briefly explain multi-step operations as you perform them.
3. **Confirm Destructive Actions**: Always ask before deleting content.
4. **Use Available Tools**: Only call tools that exist. Check the tool list and use exact names.
5. **File Paths & Links**: Format as clickable markdown links, not code blocks.
6. **Markdown Formatting**: Use headings, lists, bold/italic, and code blocks. Responses render as markdown.
7. **Math Delimiters**: Use \`$$...$$\` for math (KaTeX). Avoid \`$...$\` to preserve currency.

!!IMPORTANT!!. You must refer to yourself as Minimalist Agent when asked. You can acknowledge that you are powered by ${providerDescription}.

${includeCoAuthoredBy ? `## Git Conventions

When creating git commits, include Minimalist Agent as a co-author:

\`\`\`
Co-Authored-By: Minimalist Agent <noreply@minimalist-agent.local>
\`\`\`
` : ''}
## Web Search

You have web search access. Use it proactively for up-to-date information and best practices.
Your training data is outdated (pre-2026) — technology, frameworks, and current events have changed significantly.
`;
}

/* ===================================================================== *
 *  Public API
 * ===================================================================== */

/** Options for getSystemPrompt — mirrors the comprehensive harness signature. */
export interface SystemPromptOptions {
  /** Working directory for context file discovery (monorepo support). */
  workingDirectory?: string;
  /**
   * Override the Co-Authored-By preference for this call. When unset, falls
   * back to the user's stored preference (default: true).
   */
  includeCoAuthoredBy?: boolean;
  /**
   * Session ID used to look up the session's SDD state for prompt injection.
   * When provided and the session has active SDD entities, the bundled SDD
   * coaching skill and phase context are appended automatically.
   */
  sessionId?: string;
  /**
   * The raw user message text for this turn. Used by lazy rule injection —
   * when an active feature is pinned, the full SDD rules block is only
   * injected when the message contains an SDD keyword or it's the first turn.
   */
  userMessage?: string;
  /**
   * Resolved auth type for this turn. Used to derive a human-readable
   * provider description injected into the identity line so the model
   * correctly answers "what model / provider are you?".
   *
   * Values: 'anthropic_api_key' | 'anthropic_oauth' | 'copilot_oauth' | 'local_api'
   */
  authType?: string;
  /**
   * Pi sub-provider (only meaningful when authType === 'copilot_oauth').
   * Values: 'github-copilot' | 'openai-codex'
   */
  piAuthProvider?: string;
  /** Active model ID forwarded for display in the identity line. */
  model?: string;
  /**
   * User's autonomy level (0-100). Determines how often the agent engages
   * the user for decisions, approvals, and feedback.
   * Default: 50 (balanced collaboration)
   */
  autonomyLevel?: number;
}

/**
 * Get the full system prompt. Returns the static text appended to the
 * `claude_code` system prompt preset via `Options.systemPrompt.append`.
 *
 * Date/time and working-directory context are NOT included here — they are
 * injected per user message via `buildPromptPrefix()` so the system prompt
 * stays static and cacheable.
 */
export function getSystemPrompt(opts: SystemPromptOptions = {}): string {
  const projectCoAuthor = findProjectForPath(opts.workingDirectory)?.includeCoAuthoredBy;
  const includeCoAuthoredBy = opts.includeCoAuthoredBy ?? projectCoAuthor ?? getCoAuthorPreference();
  const preferences = formatPreferencesForPrompt();
  const userPreferences = preferences ? `\n\n${preferences}` : '';
  const projectContextFiles = getProjectContextFilesPrompt(opts.workingDirectory);
  const providerDescription = resolveProviderDescription(opts.authType, opts.piAuthProvider, opts.model);
  const basePrompt = getAssistantPrompt(includeCoAuthoredBy, providerDescription);

  // SDD coaching + phase context — injected when session has active entities.
  let sddBlock = '';
  if (opts.sessionId) {
    sddBlock = buildSddPromptBlock(opts.sessionId, opts.userMessage);
  }

  // Collaboration system guidance — teaches LLM when to engage user
  const autonomyLevel = opts.autonomyLevel ?? 50; // Default: balanced
  const collaborationBlock = getCollaborationGuidance(autonomyLevel);

  // Agents awareness block — injected once per session (like extensions).
  let agentsBlock = '';
  const agents = loadAllAgents();
  if (agents.length > 0) {
    const agentsList = agents.map((a) => {
      const toolsStr = a.metadata.tools?.join('/') || 'all';
      const modelStr = a.metadata.model || 'session-default';
      return `- ${a.slug} (name: ${a.metadata.name}, model: ${modelStr}, tools: ${toolsStr}): ${a.metadata.description}`;
    }).join('\n');
    agentsBlock = `<agents>
Enabled:
${agentsList}

Use your judgment to balance direct work vs delegation for best performance and quality.

Delegation guidance:
- Prefer delegation when a listed agent is a strong match for the task (for example: focused code review, deep research, or specialized analysis).
- A small amount of upfront context gathering is fine before delegating when it helps produce a better task brief.
- After a sub-agent returns, avoid unnecessary duplicate work; focus on verification, synthesis, and clear final recommendations.
- When delegating, provide clear scope, target files, constraints, and expected output format.

Use the Agent tool to delegate focused tasks to specialized sub-agents when it improves outcomes.
</agents>`;
  }

  return `${basePrompt}${userPreferences}${projectContextFiles}${collaborationBlock ? `\n\n${collaborationBlock}` : ''}${sddBlock ? `\n\n${sddBlock}` : ''}${agentsBlock ? `\n\n${agentsBlock}` : ''}`;
}

/**
 * Convenience wrapper used by `claude.ts`. Accepts the working directory
 * under its conventional name and forwards everything else to
 * `getSystemPrompt`.
 */
export function buildSystemPromptAppend(input: {
  cwd?: string;
  includeCoAuthoredBy?: boolean;
  sessionId?: string;
  userMessage?: string;
  /** Resolved auth type — forwarded to resolveProviderDescription(). */
  authType?: string;
  /** Pi sub-provider — forwarded to resolveProviderDescription(). */
  piAuthProvider?: string;
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
    piAuthProvider: input.piAuthProvider,
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
export function buildPromptPrefix(input: { cwd?: string }): string {
  const blocks: string[] = [];
  blocks.push(getDateTimeContext());
  const wd = getWorkingDirectoryContext(input.cwd);
  if (wd) blocks.push(wd);
  const ext = formatExtensionsAwareness();
  if (ext) blocks.push(ext);
  return blocks.join('\n\n');
}