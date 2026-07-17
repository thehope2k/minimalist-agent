// Thinking-level pill — sits next to PermissionModeButton above the composer.
// Lets the user override the per-session reasoning effort; falls back to
// AiSettings.defaultThinking when never touched for this session.

import { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Brain, Check, ChevronDown } from 'lucide-react';
import { Button } from '../ui';
import type { ThinkingLevel } from '@/lib/electron';
import { cn } from '@/lib/utils';

type Props = {
  level: ThinkingLevel;
  onLevelChange: (level: ThinkingLevel) => void;
  disabled?: boolean;
};

const ORDER: ThinkingLevel[] = ['off', 'low', 'medium', 'high', 'xhigh', 'max'];

const LABELS: Record<ThinkingLevel, string> = {
  off: 'No Thinking',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra High',
  max: 'Max',
};

const DESCRIPTIONS: Record<ThinkingLevel, string> = {
  off: 'Fastest responses, no reasoning',
  low: 'Light reasoning, faster responses',
  medium: 'Balanced speed and reasoning',
  high: 'Deep reasoning for complex tasks',
  xhigh: 'Deeper reasoning for long-horizon agentic tasks',
  max: 'Maximum reasoning budget',
};

export function ThinkingLevelButton({ level, onLevelChange, disabled }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button
          variant="outline"
          size="sm"
          icon={Brain}
          iconRight={ChevronDown}
          disabled={disabled}
          title={DESCRIPTIONS[level]}
          className="rounded-full px-2.5 border-violet-400/30 bg-violet-400/10 text-violet-300 hover:bg-violet-400/15 hover:text-violet-200"
        >
          {LABELS[level]}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          side="top"
          sideOffset={6}
          collisionPadding={8}
          className="z-50 w-64 overflow-hidden rounded-lg border border-border bg-panel p-1 shadow-2xl"
        >
          <div className="px-2.5 pb-1 pt-2 text-[10px] uppercase tracking-wider text-fg-subtle">
            Thinking level
          </div>
          {ORDER.map((l) => (
            <LevelItem
              key={l}
              level={l}
              selected={l === level}
              onSelect={() => {
                onLevelChange(l);
                setOpen(false);
              }}
            />
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function LevelItem({
  level,
  selected,
  onSelect,
}: {
  level: ThinkingLevel;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Button
      variant="ghost"
      onClick={onSelect}
      fullWidth
      className={cn(
        'h-auto items-start justify-start gap-2.5 px-2.5 py-2 text-left',
        selected && 'bg-elevated/60',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-fg">{LABELS[level]}</span>
          {selected && <Check className="h-3 w-3 text-fg" strokeWidth={2.5} />}
        </span>
        <span className="block text-xs leading-snug font-normal text-fg-subtle">
          {DESCRIPTIONS[level]}
        </span>
      </span>
    </Button>
  );
}
