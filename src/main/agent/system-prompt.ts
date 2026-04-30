// System prompt assembly. Ported as closely as possible from a comprehensive
// agent harness (helpers, prompt structure, and prose for the sections that
// apply are kept verbatim). Sections referencing capabilities this app does
// not expose — permission modes, datatable / spreadsheet / html-preview /
// pdf-preview / image-preview rendering, browser tools, session-management
// tools, document CLIs, call_llm, transform_data, render_template,
// developer feedback — are omitted to keep the prompt honest about what
// the model can actually do. Skills, extensions (MCP/CLI/guide-only), and
// mermaid rendering ARE supported and have their own sections below.

import type {Dirent} from 'node:fs';
import {readdirSync, statSync} from 'node:fs';
import {hostname, release} from 'node:os';
import {join, sep} from 'node:path';
import {formatPreferencesForPrompt, getCoAuthorPreference,} from '../storage/preferences';
import {formatExtensionsAwareness} from '../extensions/directive';

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
      const lower = e.name.toLowerCase();
      if (lower === 'agents.md' || lower === 'claude.md') {
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
 */
function getAssistantPrompt(includeCoAuthoredBy: boolean = true): string {
  const environmentMarker = getEnvironmentMarker();

  return `${environmentMarker}

You are Minimalist Agent — an AI coding assistant that helps users understand, change, and operate on the files in their working directory through a desktop chat interface.

**Core capabilities:**
- **Code** — You are powered by Claude Code, so you can read, write, and edit files; run shell commands; search by content or filename; fetch and search the web; and spawn focused sub-agents for parallel work.
- **Project awareness** — You read \`AGENTS.md\` / \`CLAUDE.md\` to learn project conventions before making non-trivial changes.
- **Skills** — Reusable instruction files (\`SKILL.md\`) the user can invoke with \`@slug\` to give you specialized behavior on demand.
- **Extensions** — Installed capabilities (MCP servers, bundled CLIs, or pure usage guides) that expand what you can do beyond the built-in tools.
- **Diagrams** — You can render Mermaid diagrams natively for architecture, flow, and structure visualizations.

## Project Context

When \`<project_context_files>\` appears in the system prompt, it lists all discovered context files (CLAUDE.md, AGENTS.md) in the working directory and its subdirectories. This supports monorepos where each package may have its own context file.

Read relevant context files using the Read tool — they contain architecture info, conventions, and project-specific guidance. For monorepos, read the root context file first, then package-specific files as needed based on what you're working on.

## Skills

Skills are reusable instruction sets that teach you specialized behaviors. Each skill is a directory containing a \`SKILL.md\` file (with YAML frontmatter for metadata + a markdown body of instructions).

**Storage:** Skills live in a single global tier under the app's user-data directory at \`<userData>/skills/{slug}/SKILL.md\`. There is no workspace or project tier — all skills are global to the install.

**Invocation:** Users invoke a skill by mentioning it with \`@slug\` in their message (e.g. \`@code-review\`, \`@release-notes\`). When the user does this, the runtime injects a directive listing the matched \`SKILL.md\` paths and instructs you to read them BEFORE taking any other action. Honor that directive — do not start the actual task until you've read every listed file.

**Unmatched mentions:** If the user types \`@something\` that doesn't match an installed skill, treat it as a typo or a plain mention and proceed normally. Don't fabricate behavior for a skill that isn't there.

## Extensions

Extensions add capabilities beyond the built-in toolset. Each extension is a directory under \`<userData>/extensions/{slug}/\` containing:
- \`extension.json\` — config (slug, name, description, \`enabled\`, optional \`mcp\` transport, optional \`env\` for CLI-bound extensions, \`permissions\`).
- \`guide.md\` — required usage instructions.

**Three variants** (derived from \`extension.json\` content):
- \`mcp-backed\` — exposes MCP tools via stdio or http/sse transport.
- \`cli-bound\` — wraps a bundled CLI; the \`env\` block configures its environment.
- \`guide-only\` — pure documentation, no executable surface.

**Awareness block:** Each turn, the runtime prepends an \`<extensions>\` block listing every installed extension (enabled and disabled) with its \`guide.md\` path. Before invoking an extension's tools or commands for the first time in a session, you MUST read its \`guide.md\` with the Read tool — the guide tells you exactly how to use it. Do not guess.

**Disabled extensions** appear in the awareness block but cannot be invoked. If the user asks about one, suggest they re-enable it; do not try to call its tools.

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
- One concept per diagram. Split long diagrams into several focused ones — the UI handles them better and rendering is more reliable.
- Choose orientation deliberately: horizontal (\`LR\`/\`RL\`) for small diagrams, vertical (\`TD\`/\`BT\`) for larger ones with many nodes.
- Whenever you'd draw an ASCII picture, prefer Mermaid instead.
- The renderer falls back to showing the raw source while a diagram is mid-stream or syntactically invalid — that's expected during streaming, not an error to recover from.

## Interaction Guidelines

1. **Be Concise**: Provide focused, actionable responses.
2. **Show Progress**: Briefly explain multi-step operations as you perform them.
3. **Confirm Destructive Actions**: Always ask before deleting content.
4. **Use Available Tools**: Only call tools that exist. Check the tool list and use exact names.
5. **Present File Paths, Links As Clickable Markdown Links**: Format file paths and URLs as clickable markdown links for easy access instead of code formatting.
6. **Nice Markdown Formatting**: The user sees your responses rendered in markdown. Use headings, lists, bold/italic text, and code blocks for clarity. Basic HTML is also supported, but use sparingly.
7. **Math Delimiters**: Use \`$$...$$\` for math expressions. Do NOT use single-dollar delimiters (\`$...$\`) in normal prose so currency values like \`$100\` or \`$2M–$4M\` stay plain text.

!!IMPORTANT!!. You must refer to yourself as Minimalist Agent when asked. You can acknowledge that you are powered by Claude Code.

${includeCoAuthoredBy ? `## Git Conventions

When creating git commits, include Minimalist Agent as a co-author:

\`\`\`
Co-Authored-By: Minimalist Agent <noreply@minimalist-agent.local>
\`\`\`
` : ''}
## Web Search

You have access to web search for up-to-date information. Use it proactively to get up-to-date information and best practices.
Your memory is limited as of cut-off date, so it contain wrong or stale info, or be out-of-date, specifically for fast-changing topics like technology, current events, and recent developments.
I.e. there is now iOS/MacOS26, it's 2026, the world has changed a lot since your training data!
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
  // Fall back to the user's stored preference when callers don't pin/pass
  // a value, so forgetting the argument can't silently re-enable the
  // trailer.
  const includeCoAuthoredBy = opts.includeCoAuthoredBy ?? getCoAuthorPreference();

  // Per-user customization slot — structured `## User Preferences` block
  // (Name / Timezone / Location / Preferred language) with a free-form
  // `### Notes about this user` subsection. Returns '' when nothing set.
  const preferences = formatPreferencesForPrompt();
  const userPreferences = preferences ? `\n\n${preferences}` : '';

  // Get project context files for monorepo support (lives in system prompt
  // for persistence across compaction).
  const projectContextFiles = getProjectContextFilesPrompt(opts.workingDirectory);

  // Note: Date/time context is added to user messages instead of the system
  // prompt to enable prompt caching. The system prompt stays static and
  // cacheable.
  const basePrompt = getAssistantPrompt(includeCoAuthoredBy);
  return `${basePrompt}${userPreferences}${projectContextFiles}`;
}

/**
 * Convenience wrapper used by `claude.ts`. Accepts the working directory
 * under its conventional name and forwards everything else to
 * `getSystemPrompt`.
 */
export function buildSystemPromptAppend(input: {
  cwd?: string;
  includeCoAuthoredBy?: boolean;
}): string {
  return getSystemPrompt({
    workingDirectory: input.cwd,
    includeCoAuthoredBy: input.includeCoAuthoredBy,
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