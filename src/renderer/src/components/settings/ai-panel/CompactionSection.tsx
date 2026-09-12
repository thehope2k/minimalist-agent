import {
  DEFAULT_KEEP_RECENT_FRACTION,
  DEFAULT_KEEP_RECENT_TOKENS_CEILING,
  DEFAULT_KEEP_RECENT_TOKENS_FLOOR,
  DEFAULT_RESERVE_FRACTION,
  DEFAULT_RESERVE_TOKENS_CEILING,
  DEFAULT_RESERVE_TOKENS_FLOOR,
  resolveCompactionSettings,
  setCompactionSettings,
} from '@/lib/connections';
import type { AiSettings } from '@/lib/electron';
import { Input } from '@/components/ui';
import { SettingsCard, SettingsDivider, SettingsRow, SettingsToggle } from '../SettingsPrimitives';

const PERCENT_MULTIPLIER = 100;
const EXAMPLE_CONTEXT_WINDOW = 272_000;

function fractionToPercent(fraction: number): number {
  return Math.round(fraction * PERCENT_MULTIPLIER);
}

function percentToFraction(percent: number): number {
  return percent / PERCENT_MULTIPLIER;
}

export function CompactionSection({ settings }: { settings: AiSettings }) {
  const compaction = settings.compactionSettings;
  const enabled = compaction?.enabled ?? true;
  const example = resolveCompactionSettings(compaction, { contextWindow: EXAMPLE_CONTEXT_WINDOW });

  return (
    <SettingsCard>
      <SettingsToggle
        label="Auto-compact"
        description="Summarize older messages before the reserved response space is needed."
        checked={enabled}
        onCheckedChange={(v) => void setCompactionSettings({ enabled: v })}
      />
      <SettingsDivider />
      <CompactionTuningRow
        label="Reserve for replies"
        description="Space kept for the next reply. This determines when auto-compaction starts."
        percent={fractionToPercent(compaction?.reserveFraction ?? DEFAULT_RESERVE_FRACTION)}
        floor={compaction?.reserveTokensFloor ?? DEFAULT_RESERVE_TOKENS_FLOOR}
        ceiling={compaction?.reserveTokensCeiling ?? DEFAULT_RESERVE_TOKENS_CEILING}
        onPercentChange={(v) => void setCompactionSettings({ reserveFraction: percentToFraction(v) })}
        onFloorChange={(v) => void setCompactionSettings({ reserveTokensFloor: v })}
        onCeilingChange={(v) => void setCompactionSettings({ reserveTokensCeiling: v })}
        disabled={!enabled}
      />
      <SettingsDivider />
      <CompactionTuningRow
        label="Keep recent context"
        description="Newest conversation retained exactly after older messages are summarized."
        percent={fractionToPercent(compaction?.keepRecentFraction ?? DEFAULT_KEEP_RECENT_FRACTION)}
        floor={compaction?.keepRecentTokensFloor ?? DEFAULT_KEEP_RECENT_TOKENS_FLOOR}
        ceiling={compaction?.keepRecentTokensCeiling ?? DEFAULT_KEEP_RECENT_TOKENS_CEILING}
        onPercentChange={(v) => void setCompactionSettings({ keepRecentFraction: percentToFraction(v) })}
        onFloorChange={(v) => void setCompactionSettings({ keepRecentTokensFloor: v })}
        onCeilingChange={(v) => void setCompactionSettings({ keepRecentTokensCeiling: v })}
        disabled={!enabled}
      />
      <CompactionExample
        enabled={enabled}
        reserveTokens={example.reserveTokens}
        keepRecentTokens={example.keepRecentTokens}
      />
    </SettingsCard>
  );
}

function CompactionTuningRow({
  label,
  description,
  percent,
  floor,
  ceiling,
  onPercentChange,
  onFloorChange,
  onCeilingChange,
  disabled,
}: {
  label: string;
  description: string;
  percent: number;
  floor: number;
  ceiling: number;
  onPercentChange: (value: number) => void;
  onFloorChange: (value: number) => void;
  onCeilingChange: (value: number) => void;
  disabled: boolean;
}) {
  return (
    <SettingsRow
      label={label}
      description={description}
      control={
        <div className="flex items-center gap-2 text-xs text-fg-subtle">
          <div className="flex items-center gap-1.5">
            <Input
              aria-label={`${label} percentage`}
              type="number"
              disabled={disabled}
              min={1}
              max={90}
              value={percent}
              onChange={(e) => {
                const value = parseInt(e.target.value, 10);
                if (Number.isFinite(value)) onPercentChange(value);
              }}
              className="w-16 text-right"
            />
            <span>%</span>
          </div>
          <BoundInput
            label="Min"
            ariaLabel={`${label} minimum tokens`}
            value={floor}
            disabled={disabled}
            onChange={onFloorChange}
          />
          <BoundInput
            label="Max"
            ariaLabel={`${label} maximum tokens`}
            value={ceiling}
            disabled={disabled}
            onChange={onCeilingChange}
          />
        </div>
      }
    />
  );
}

function BoundInput({
  label,
  ariaLabel,
  value,
  disabled,
  onChange,
}: {
  label: string;
  ariaLabel: string;
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <span>{label}</span>
      <Input
        aria-label={ariaLabel}
        type="number"
        disabled={disabled}
        min={0}
        step={1000}
        value={value}
        onChange={(e) => {
          const next = parseInt(e.target.value, 10);
          if (Number.isFinite(next)) onChange(next);
        }}
        className="w-21 text-right text-xs"
      />
    </div>
  );
}

function CompactionExample({
  enabled,
  reserveTokens,
  keepRecentTokens,
}: {
  enabled: boolean;
  reserveTokens: number;
  keepRecentTokens: number;
}) {
  const compactAt = EXAMPLE_CONTEXT_WINDOW - reserveTokens;
  const compactPct = Math.round((compactAt / EXAMPLE_CONTEXT_WINDOW) * PERCENT_MULTIPLIER);

  return (
    <div className="border-t border-border bg-elevated/30 px-4 py-3 text-xs text-fg-subtle">
      <div className="font-medium text-fg">Example — a 272k-token model</div>
      <div className="mt-1">
        {enabled
          ? `Keeps ${reserveTokens.toLocaleString()} tokens for a reply, so auto-compaction begins near ${compactAt.toLocaleString()} tokens (${compactPct}%). After compaction, ${keepRecentTokens.toLocaleString()} recent tokens stay exact.`
          : 'Auto-compaction is off. These values take effect when it is re-enabled.'}
      </div>
    </div>
  );
}
