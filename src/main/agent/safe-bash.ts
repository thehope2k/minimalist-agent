/**
 * Safe Bash Command Checker
 *
 * Determines whether a bash command is provably read-only — safe to auto-allow
 * in 'ask' mode without prompting the user for confirmation.
 *
 * Design: pre-flight dangerous-construct detection + quoted-string-aware
 * compound splitting + allowlist pattern matching. No AST parser required —
 * kept intentionally shallow and auditable.
 *
 * Used by both the Anthropic (`permissions.ts`) and Pi (`permission-bridge.ts`)
 * permission gates.
 */

// ── Display metadata (consumed by PermissionsPanel in the renderer) ─────────

/**
 * Human-readable category entry for the Permissions settings panel.
 * Contains only strings — safe to duplicate in the renderer.
 */
export interface SafeBashCategory {
  label: string;
  examples: string;
}

/**
 * Ordered list of safe-bash categories shown in the Permissions settings panel.
 * Mirrors the SAFE_PATTERNS grouping below.
 */
export const SAFE_BASH_CATEGORIES: SafeBashCategory[] = [
  {
    label: 'File reading',
    examples: 'ls, cat, head, tail, bat, stat, file, wc, du, df, tree',
  },
  {
    label: 'Search',
    examples: 'grep, rg, ag, fd, find (no -exec/-delete), which, locate',
  },
  {
    label: 'Git read',
    examples:
      'git status, git log, git diff, git show, git blame, git branch, git stash list, git reflog…',
  },
  {
    label: 'GitHub CLI read',
    examples: 'gh pr view/list, gh issue view/list, gh repo view, gh auth status',
  },
  {
    label: 'Package manager read',
    examples: 'npm ls/outdated, yarn list, pnpm ls, bun pm ls',
  },
  {
    label: 'Type checking',
    examples: 'tsc --noEmit, bun run typecheck, npm run typecheck',
  },
  {
    label: 'Text processing',
    examples: 'jq, yq, sort, uniq, cut, tr, awk (safe forms), sed -n, column, xmllint',
  },
  {
    label: 'System info',
    examples: 'pwd, whoami, echo, date, ps, env, uname, hostname, id',
  },
  {
    label: 'Version checks',
    examples: 'node -v, python --version, go version, rustc -V, cargo -V…',
  },
  {
    label: 'Navigation & help',
    examples: 'cd, <any command> --help',
  },
];

// ── Compiled safe-command patterns ───────────────────────────────────────────

/**
 * Patterns are anchored to the start of a command segment (after compound
 * splitting). Each pattern must match the FULL command token, not just a prefix.
 *
 * Post-match guards for `find` and `awk` live in separate functions below
 * to keep the pattern list clean.
 */
const SAFE_PATTERNS: readonly RegExp[] = [
  // ── File reading ──────────────────────────────────────────────────────────
  /^ls\b/,
  /^ll\b/,
  /^la\b/,
  /^cat\b/,
  /^head\b/,
  /^tail\b/,
  /^bat\b/,
  /^less\b/,
  /^more\b/,
  /^nl\b/,
  /^file\b/,
  /^stat\b/,
  /^wc\b/,
  /^du\b/,
  /^df\b/,
  /^tree\b/,

  // ── Search ────────────────────────────────────────────────────────────────
  /^grep\b/,
  /^rg\b/,
  /^ag\b/,
  /^fd\b/,
  /^fzf\b/,
  /^find\b/, // post-match guard: isFindSafe()
  /^locate\b/,
  /^which\b/,
  /^whereis\b/,
  /^type\b/,

  // ── Git read-only ─────────────────────────────────────────────────────────
  // Supports leading global flags: git -C /path status, git --no-pager log, etc.
  // Pattern: git [(-X [value] | --flag [value])...] <safe-subcommand> [args...]
  /^git\s+(?:(?:-[A-Za-z]\S*|--[a-z][-a-z0-9]*)(?:\s+[^\s-]\S*)?\s+)*(?:status|log|diff|show|branch|tag|stash\s+list|describe|rev-parse|config(?:\s+(?:--get|-l))?|ls-files|ls-tree|shortlog|blame|annotate|reflog|cherry|whatchanged|ls-remote)\b/,

  // ── GitHub CLI read ───────────────────────────────────────────────────────
  /^gh\s+(?:pr|issue|repo|release|run|workflow|gist|project)\s+(?:view|list|status|diff|checks|comments)\b/,
  /^gh\s+auth\s+status\b/,
  /^gh\s+config\s+(?:get|list)\b/,

  // ── Package manager reads ─────────────────────────────────────────────────
  /^npm\s+(?:ls|list|view|info|show|outdated|audit|explain|why)\b/,
  /^yarn\s+(?:list|info|why|outdated|audit)\b/,
  /^pnpm\s+(?:list|ls|why|outdated|audit)\b/,
  /^bun\s+pm\s+ls\b/,

  // ── Type checking (read-only quality gate) ────────────────────────────────
  /^(?:bunx\s+tsc|tsc)\b.*--noEmit\b/,
  /^(?:npm|yarn|pnpm)\s+run\s+typecheck(?::all)?\b/,
  /^bun\s+run\s+typecheck(?::all)?\b/,

  // ── Text processing ───────────────────────────────────────────────────────
  /^sort\b/,
  /^uniq\b/,
  /^cut\b/,
  /^tr\b/,
  /^column\b/,
  /^sed\s+(?:-n|--quiet|--silent)\b/, // sed only in print-only mode
  /^(?:awk|gawk|mawk|nawk)\b/, // post-match guard: isAwkSafe()
  /^jq\b/,
  /^yq\b/,
  /^xq\b/,
  /^xmllint\b/,
  /^json_pp\b/,
  /^python3?\s+-m\s+json\.tool\b/,

  // ── System info ───────────────────────────────────────────────────────────
  /^pwd\b/,
  /^whoami\b/,
  /^id\b/,
  /^groups\b/,
  /^hostname\b/,
  /^uname\b/,
  /^date\b/,
  /^uptime\b/,
  /^echo\b/,
  /^ps\b/,
  /^env$/, // bare `env` only (not `env VAR=x cmd`)
  /^printenv\b/,
  /^free\b/,
  /^vmstat\b/,
  /^iostat\b/,

  // ── Network diagnostics (read-only) ──────────────────────────────────────
  /^ping\b/,
  /^traceroute\b/,
  /^dig\b/,
  /^nslookup\b/,
  /^host\b/,
  /^netstat\b/,
  /^ss\b/,

  // ── Version checks ────────────────────────────────────────────────────────
  /^node\s+(?:--version|-v)\b/,
  /^npm\s+(?:--version|-v)\b/,
  /^yarn\s+(?:--version|-v)\b/,
  /^pnpm\s+(?:--version|-v)\b/,
  /^bun\s+(?:--version|-v)\b/,
  /^python3?\s+(?:-V|--version)\b/,
  /^ruby\s+(?:-v|--version)\b/,
  /^go\s+version\b/,
  /^rustc\s+(?:-V|--version)\b/,
  /^cargo\s+(?:-V|--version)\b/,
  /^java\s+(?:-version|--version)\b/,
  /^php\s+(?:--version|-v)\b/,
  /^perl\s+(?:--version|-v)\b/,
  /^dotnet\s+--version\b/,

  // ── Navigation ────────────────────────────────────────────────────────────
  /^cd\b/,

  // ── Help flags (any command, always safe) ─────────────────────────────────
  /--help\b/,
  /-h$/,
];

// ── Post-match guards ─────────────────────────────────────────────────────────

/** `find` arguments that execute subcommands or delete files. */
const DANGEROUS_FIND_ARGS = new Set([
  '-exec', '-execdir', '-ok', '-okdir', '-delete',
]);

/** Patterns indicating dangerous awk execution primitives. */
const DANGEROUS_AWK_PATTERNS: readonly RegExp[] = [
  /\bsystem\s*\(/i,          // system("cmd")
  /\|\s*getline\b/i,         // "cmd" | getline
  /\bprint\b[^\n]*\|\s*["'`]/i, // print ... | "cmd"
];

function isFindSafe(segment: string): boolean {
  const parts = segment.trim().split(/\s+/);
  return !parts.some(p => DANGEROUS_FIND_ARGS.has(p));
}

function isAwkSafe(segment: string): boolean {
  return !DANGEROUS_AWK_PATTERNS.some(re => re.test(segment));
}

// ── Pre-flight: dangerous construct detection ──────────────────────────────

/**
 * Returns `true` if `command` contains a dangerous shell construct that must
 * be blocked regardless of which command binary it belongs to.
 *
 * Checked on the full command string BEFORE compound splitting so constructs
 * embedded anywhere in a pipeline are caught.
 *
 * Blocked constructs (outside single-quoted strings where noted):
 *   $( )          command substitution
 *   ` `           backtick substitution
 *   <( )  >( )    process substitution
 *   &             background execution (trailing & not &&)
 *   VAR=value     env-variable assignment at command start (PATH hijack)
 *   > file        output redirect to a real file
 *   >>            append redirect
 *   \0            null byte
 *
 * Safe redirect forms (NOT blocked):
 *   < file        input redirect — read-only
 *   >/dev/null    discard stdout
 *   2>/dev/null   discard stderr
 *   2>&1  >&2     file-descriptor duplication (no real file written)
 */
export function isUnsafeSyntax(command: string): boolean {
  const trimmed = command.trim();
  if (!trimmed) return false;

  // Env-var assignment at the very start: VAR=value cmd
  if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(trimmed)) return true;

  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i]!;
    const nx = trimmed[i + 1] ?? '';

    // ── Quote tracking ──────────────────────────────────────────────────
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (inSingle) continue; // everything inside '' is literal

    if (ch === '"') {
      inDouble = !inDouble;
      continue;
    }

    // ── Escape sequences ────────────────────────────────────────────────
    if (ch === '\\') {
      i++; // skip the escaped character
      continue;
    }

    // ── Dangerous constructs (detectable inside double-quotes too) ──────
    if (ch === '$' && nx === '(') return true;          // $(...)
    if (ch === '`') return true;                         // `...`
    if ((ch === '<' || ch === '>') && nx === '(') return true; // <() >()\

    if (inDouble) continue; // redirect and & checks apply outside "" only

    // ── Outside all quotes ───────────────────────────────────────────────
    if (ch === '\0') return true; // null byte

    // Background execution: standalone & is background exec.
    // && is a logical-AND operator — skip both chars and continue.
    if (ch === '&') {
      if (nx === '&') {
        i++; // skip second &; && is safe at syntax level (each part validated separately)
        continue;
      }
      return true; // lone & = background execution
    }

    // Append redirect >> (always unsafe)
    if (ch === '>' && nx === '>') return true;

    // Force-overwrite redirect >|
    if (ch === '>' && nx === '|') return true;

    // Output redirect >
    if (ch === '>') {
      // >&N  — fd duplication, no real file written (e.g. 2>&1, >&2)
      if (nx === '&') {
        i++; // skip &
        while (i + 1 < trimmed.length && /\d/.test(trimmed[i + 1]!)) i++;
        continue;
      }

      // Skip optional whitespace, then check target
      let j = i + 1;
      while (j < trimmed.length && trimmed[j] === ' ') j++;

      // >/dev/null  — safe discard
      if (trimmed.slice(j).startsWith('/dev/null')) {
        i = j + '/dev/null'.length - 1;
        continue;
      }

      // Anything else is a real file write — unsafe
      return true;
    }
  }

  return false;
}

// ── Compound-command splitting ────────────────────────────────────────────────

/**
 * Splits a shell command on top-level compound operators (&&, ||, |, ;)
 * without splitting inside single or double quotes.
 *
 * Returns an array of trimmed, non-empty command segments.
 *
 * @example
 * splitCompound("git status && git log")  // ["git status", "git log"]
 * splitCompound("git log | head -20")     // ["git log", "head -20"]
 * splitCompound("echo 'a||b'")            // ["echo 'a||b'"]
 */
export function splitCompound(command: string): string[] {
  const segments: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i]!;
    const nx = command[i + 1] ?? '';

    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      current += ch;
      continue;
    }
    if (inSingle) { current += ch; continue; }

    if (ch === '"') { inDouble = !inDouble; current += ch; continue; }
    if (inDouble) { current += ch; continue; }

    // Outside all quotes — check for compound operators
    if (ch === '&' && nx === '&') {
      segments.push(current.trim());
      current = '';
      i++; // consume second &
      continue;
    }
    if (ch === '|' && nx === '|') {
      segments.push(current.trim());
      current = '';
      i++; // consume second |
      continue;
    }
    if (ch === '|') {
      segments.push(current.trim());
      current = '';
      continue;
    }
    if (ch === ';') {
      segments.push(current.trim());
      current = '';
      continue;
    }

    current += ch;
  }

  const tail = current.trim();
  if (tail) segments.push(tail);

  return segments.filter(s => s.length > 0);
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Returns `true` if `command` is safe to auto-allow in 'ask' permission mode
 * without prompting the user.
 *
 * A command is considered safe when ALL of the following hold:
 *  1. It contains no dangerous shell constructs (command substitution,
 *     unsafe redirects, background execution, env-var injection, etc.)
 *  2. Every segment in a compound command (&&, ||, |, ;) matches at least
 *     one entry in the safe-pattern allowlist
 *  3. Per-command guards pass: `find` has no -exec/-delete; `awk` has no
 *     system() / pipe-getline / print-to-command
 */
export function isSafeBashCommand(command: string): boolean {
  const trimmed = command.trim();
  if (!trimmed) return false;

  // Step 1: reject dangerous shell syntax across the whole command string
  if (isUnsafeSyntax(trimmed)) return false;

  // Step 2: split on compound operators, validate each segment independently
  const segments = splitCompound(trimmed);
  if (segments.length === 0) return false;

  return segments.every(isSegmentSafe);
}

/** @internal Check a single (non-compound) segment against the allowlist. */
function isSegmentSafe(segment: string): boolean {
  const s = segment.trim();
  if (!s) return false;

  if (!SAFE_PATTERNS.some(p => p.test(s))) return false;

  // Post-match guards
  if (/^find\b/.test(s) && !isFindSafe(s)) return false;
  if (/^(?:awk|gawk|mawk|nawk)\b/.test(s) && !isAwkSafe(s)) return false;

  return true;
}
