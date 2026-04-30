// Permission mode pill — sits directly above the message composer.
// Three modes mapped onto the SDK's `permissionMode` (see
// src/main/agent/permissions.ts):
//
//   plan  → SDK 'plan'              read-only, agent produces a plan
//   ask   → SDK 'default' + canUseTool   user confirms each mutation
//   auto  → SDK 'bypassPermissions' no prompts, max speed

import { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Check, ChevronDown, Compass, ShieldCheck, Zap } from 'lucide-react';
import { Button } from '../ui';
import type { PermissionMode } from '@/lib/electron';
import { cn } from '@/lib/utils';

type Props = {
  value: PermissionMode;
  onChange: (mode: PermissionMode) => void;
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
  ask: {
    label: 'Ask',
    description:
      'Default. Confirm before each file edit, write, or shell command.',
    icon: ShieldCheck,
    pill: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/15 hover:text-emerald-200',
    iconTone: 'text-emerald-300',
  },
  auto: {
    label: 'Auto',
    description:
      'Trusted automation. Tools run without asking — use with care.',
    icon: Zap,
    pill: 'border-amber-400/30 bg-amber-400/10 text-amber-300 hover:bg-amber-400/15 hover:text-amber-200',
    iconTone: 'text-amber-300',
  },
};

const ORDER: PermissionMode[] = ['plan', 'ask', 'auto'];

export function PermissionModeButton({ value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const meta = MODES[value];

  return (
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
            Permission mode
          </div>
          {ORDER.map((m) => (
            <ModeItem
              key={m}
              meta={MODES[m]}
              selected={m === value}
              onSelect={() => {
                onChange(m);
                setOpen(false);
              }}
            />
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
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
