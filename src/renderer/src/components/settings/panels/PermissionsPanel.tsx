/**
 * PermissionsPanel
 *
 * Explains the three permission modes and documents which tools and bash
 * commands are auto-allowed in Ask mode without a confirmation prompt.
 *
 * Intentionally read-only / informational — users change their default mode
 * via the AI Settings panel, and change per-session mode via the composer
 * pill. This panel just makes the policy visible.
 */

import { Compass, ShieldCheck, Zap, Terminal, Wrench } from 'lucide-react';
import { SettingsDivider, SettingsSection } from '../SettingsPrimitives';

// ── Mode display data ─────────────────────────────────────────────────────────

interface ModeMeta {
  id: string;
  label: string;
  icon: React.ElementType;
  description: string;
  detail: string;
  pill: string;
  iconTone: string;
  ring: string;
}

const MODES: ModeMeta[] = [
  {
    id: 'plan',
    label: 'Plan',
    icon: Compass,
    description: 'Read-only research',
    detail:
      'No file edits, no shell commands. The agent explores and proposes a written plan; you approve before anything changes.',
    pill: 'bg-sky-400/10 border-sky-400/30',
    iconTone: 'text-sky-300',
    ring: 'ring-sky-400/20',
  },
  {
    id: 'ask',
    label: 'Ask',
    icon: ShieldCheck,
    description: 'Confirm before mutations',
    detail:
      'Safe reads run instantly. Before writing files or running non-safe shell commands, the agent pauses and asks you.',
    pill: 'bg-emerald-400/10 border-emerald-400/30',
    iconTone: 'text-emerald-300',
    ring: 'ring-emerald-400/20',
  },
  {
    id: 'auto',
    label: 'Auto',
    icon: Zap,
    description: 'Fully autonomous',
    detail:
      'All tools run without any prompt. Best for tasks you fully trust the agent to complete end-to-end.',
    pill: 'bg-amber-400/10 border-amber-400/30',
    iconTone: 'text-amber-300',
    ring: 'ring-amber-400/20',
  },
];

// ── Auto-allowed data (mirrors safe-bash.ts — strings only, no RegExp) ────────

const ALWAYS_ALLOWED_TOOLS = [
  'Read', 'Glob', 'Grep', 'LS',
  'WebFetch', 'WebSearch', 'TodoWrite', 'NotebookRead',
];

interface SafeBashCategory {
  label: string;
  examples: string;
}

/**
 * Mirrors SAFE_BASH_CATEGORIES from `src/main/agent/safe-bash.ts`.
 * Kept as plain strings so this file is renderer-safe (no Node.js imports).
 */
const SAFE_BASH_DISPLAY: SafeBashCategory[] = [
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

// ── Sub-components ────────────────────────────────────────────────────────────

function ModeCard({ meta }: { meta: ModeMeta }) {
  const Icon = meta.icon;
  return (
    <div
      className={`flex flex-col gap-3 rounded-lg border p-4 ${meta.pill} ring-1 ${meta.ring}`}
    >
      <div className="flex items-center gap-2">
        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-md bg-white/5 ${meta.iconTone}`}>
          <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
        </span>
        <span className="text-sm font-semibold text-fg">{meta.label}</span>
      </div>
      <div>
        <p className="text-xs font-medium text-fg-muted">{meta.description}</p>
        <p className="mt-1 text-xs leading-relaxed text-fg-subtle">{meta.detail}</p>
      </div>
    </div>
  );
}

function ToolChip({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center rounded-md border border-border bg-elevated px-2 py-0.5 font-mono text-[11px] text-fg-muted">
      {name}
    </span>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function PermissionsPanel() {
  return (
    <div className="mx-auto max-w-190 px-8 py-10 space-y-0">
      {/* Mode overview */}
      <SettingsSection
        title="Permission Modes"
        subtitle="Controls when the agent pauses to ask before using tools. Switch modes in the composer or set your default in AI Settings."
      >
        <div className="grid grid-cols-3 gap-3">
          {MODES.map(m => (
            <ModeCard key={m.id} meta={m} />
          ))}
        </div>
      </SettingsSection>

      {/* Auto-allowed in Ask mode */}
      <SettingsSection
        title="Auto-allowed in Ask mode"
        subtitle="These tools and commands never trigger a confirmation prompt — they are provably read-only."
      >
        <div className="overflow-hidden rounded-lg border border-border bg-panel">
          {/* Structural file / web tools */}
          <div className="px-4 py-4">
            <div className="mb-2 flex items-center gap-1.5">
              <Wrench className="h-3.5 w-3.5 text-fg-subtle" strokeWidth={1.75} />
              <span className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
                File &amp; Web tools
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ALWAYS_ALLOWED_TOOLS.map(t => (
                <ToolChip key={t} name={t} />
              ))}
            </div>
          </div>

          <SettingsDivider />

          {/* Safe bash commands */}
          <div className="px-4 py-4">
            <div className="mb-3 flex items-center gap-1.5">
              <Terminal className="h-3.5 w-3.5 text-fg-subtle" strokeWidth={1.75} />
              <span className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
                Safe bash commands
              </span>
            </div>
            <div className="space-y-2">
              {SAFE_BASH_DISPLAY.map(cat => (
                <div key={cat.label} className="flex gap-3 text-xs">
                  <span className="w-40 shrink-0 font-medium text-fg-muted">
                    {cat.label}
                  </span>
                  <span className="text-fg-subtle">{cat.examples}</span>
                </div>
              ))}
            </div>
          </div>

          <SettingsDivider />

          {/* Footer note inside the card */}
          <div className="px-4 py-3 text-xs text-fg-subtle">
            All other Bash commands, Write, Edit, and tool calls pause for your
            confirmation in Ask mode. Dangerous shell constructs — command
            substitution{' '}
            <code className="rounded bg-elevated px-1 font-mono text-[10px]">$(…)</code>
            , output redirects{' '}
            <code className="rounded bg-elevated px-1 font-mono text-[10px]">&gt; file</code>
            , background execution{' '}
            <code className="rounded bg-elevated px-1 font-mono text-[10px]">&amp;</code>
            {' '}— are always blocked even within safe-named commands.
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}
