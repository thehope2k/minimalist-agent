// Permission mode pill + autonomy slider — sits directly above the message composer.
// Two modes:
//
//   plan → SDK 'plan'               read-only, agent produces a plan
//   auto → SDK 'default' + canUseTool    intelligent collaboration based on autonomy level
//
// In auto mode, shows an autonomy slider (0-100%) controlling how often
// the agent engages the user in collaborative decision-making.

import { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Check, ChevronDown, Compass, Zap } from 'lucide-react';
import { Button } from '../ui';
import type { PermissionMode } from '@/lib/electron';
import { cn } from '@/lib/utils';

type Props = {
  mode: PermissionMode;
  onModeChange: (mode: PermissionMode) => void;
  autonomyLevel: number; // 0-100
  onAutonomyChange: (level: number) => void;
  disabled?: boolean;
};

interface ModeMeta {
  label: string;
  description: string;
  icon: React.ElementType;
  /** Pill tone — colored ring + tinted background for the trigger. */
  pill: string;
  /** Subtle accent on the icon inside the popover items. */
  iconTone: string;
}

const MODES: Record<PermissionMode, ModeMeta> = {
  plan: {
    label: 'Plan',
    description:
      'Read-only. Agent researches and proposes a plan; no edits or commands run.',
    icon: Compass,
    pill: 'border-sky-400/30 bg-sky-400/10 text-sky-300 hover:bg-sky-400/15 hover:text-sky-200',
    iconTone: 'text-sky-300',
  },
  auto: {
    label: 'Auto',
    description:
      'Intelligent execution. Agent adapts collaboration based on autonomy level.',
    icon: Zap,
    pill: 'border-amber-400/30 bg-amber-400/10 text-amber-300 hover:bg-amber-400/15 hover:text-amber-200',
    iconTone: 'text-amber-300',
  },
};

const ORDER: PermissionMode[] = ['plan', 'auto'];

export function PermissionModeButton({
  mode,
  onModeChange,
  autonomyLevel,
  onAutonomyChange,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const meta = MODES[mode];

  return (
    <div className="flex items-center gap-2">
      {/* Mode Selector */}
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <Button
            variant="outline"
            size="sm"
            icon={meta.icon}
            iconRight={ChevronDown}
            disabled={disabled}
            title={meta.description}
            className={cn('rounded-full px-2.5', meta.pill)}
          >
            {meta.label}
          </Button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            side="top"
            sideOffset={6}
            collisionPadding={8}
            className="z-50 w-72 overflow-hidden rounded-lg border border-border bg-panel p-1 shadow-2xl"
          >
            <div className="px-2.5 pb-1 pt-2 text-[10px] uppercase tracking-wider text-fg-subtle">
              Execution mode
            </div>
            {ORDER.map((m) => (
              <ModeItem
                key={m}
                meta={MODES[m]}
                selected={m === mode}
                onSelect={() => {
                  onModeChange(m);
                  setOpen(false);
                }}
              />
            ))}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      {/* Autonomy Slider (only in Auto mode) */}
      {mode === 'auto' && (
        <div className="flex items-center gap-2 px-2 py-1 rounded-full border border-border bg-elevated-1">
          <span className="text-xs text-fg-subtle whitespace-nowrap">Autonomy:</span>
          <input
            type="range"
            min="0"
            max="100"
            value={autonomyLevel}
            onChange={(e) => onAutonomyChange(Number(e.target.value))}
            disabled={disabled}
            className="w-24 h-1 bg-border rounded-full appearance-none cursor-pointer accent-amber-400 disabled:opacity-50 disabled:cursor-not-allowed"
            title={getAutonomyDescription(autonomyLevel)}
          />
          <span className="text-xs font-medium text-fg tabular-nums min-w-[2.5rem] text-right">
            {autonomyLevel}%
          </span>
        </div>
      )}
    </div>
  );
}

/* ---- popover row ------------------------------------------------- */

function ModeItem({
  meta,
  selected,
  onSelect,
}: {
  meta: ModeMeta;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = meta.icon;
  return (
    // `Button` is the shared primitive; we override layout to be a tall
    // multi-line list row (left icon + title/description stack + check).
    <Button
      variant="ghost"
      onClick={onSelect}
      fullWidth
      className={cn(
        'h-auto items-start justify-start gap-2.5 px-2.5 py-2 text-left',
        selected && 'bg-elevated/60',
      )}
    >
      <Icon
        className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', meta.iconTone)}
        strokeWidth={2}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-fg">{meta.label}</span>
          {selected && <Check className="h-3 w-3 text-fg" strokeWidth={2.5} />}
        </span>
        <span className="block text-xs leading-snug font-normal text-fg-subtle">
          {meta.description}
        </span>
      </span>
    </Button>
  );
}

/* ---- autonomy tooltips ------------------------------------------- */

function getAutonomyDescription(level: number): string {
  if (level <= 30) {
    return 'Collaborative — Frequent engagement for decisions, preferences, and feedback';
  }
  if (level <= 60) {
    return 'Balanced — Moderate engagement for complex decisions and risky operations';
  }
  if (level <= 80) {
    return 'Independent — Minimal engagement, only for significant decisions';
  }
  return 'Autonomous — Rare engagement, very high independence';
}
