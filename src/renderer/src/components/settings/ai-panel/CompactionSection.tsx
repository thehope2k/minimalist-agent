import {
  DEFAULT_KEEP_RECENT_FRACTION,
  DEFAULT_KEEP_RECENT_TOKENS_CEILING,
  DEFAULT_KEEP_RECENT_TOKENS_FLOOR,
  DEFAULT_RESERVE_FRACTION,
  DEFAULT_RESERVE_TOKENS_CEILING,
  DEFAULT_RESERVE_TOKENS_FLOOR,
  setCompactionSettings,
} from '@/lib/connections';
import type { AiSettings, ModelDef } from '@/lib/electron';
import { Input, Select } from '@/components/ui';
import { SettingsCard, SettingsDivider, SettingsRow, SettingsToggle } from '../SettingsPrimitives';

const PERCENT_MULTIPLIER = 100;

function fractionToPercent(fraction: number): number {
  return Math.round(fraction * PERCENT_MULTIPLIER);
}

function percentToFraction(percent: number): number {
  return percent / PERCENT_MULTIPLIER;
}

export function CompactionSection({
  settings,
  availableModels,
}: {
  settings: AiSettings;
  availableModels: ModelDef[];
}) {
  const compaction = settings.compactionSettings;

  return (
    <SettingsCard>
      <SettingsToggle
        label="Auto-compact"
        description="Automatically summarize older messages when the context window fills up."
        checked={compaction?.enabled ?? true}
        onCheckedChange={(v) => void setCompactionSettings({ enabled: v })}
      />
      <SettingsDivider />
      <SettingsRow
        label="Reserve %"
        description="% of the active model's context window reserved for its response."
        control={
          <PercentInput
            percent={fractionToPercent(compaction?.reserveFraction ?? DEFAULT_RESERVE_FRACTION)}
            onChange={(v) => void setCompactionSettings({ reserveFraction: percentToFraction(v) })}
          />
        }
      />
      <SettingsDivider />
      <SettingsRow
        label="Keep recent %"
        description="% of the active model's context window kept verbatim (never summarized) after a compaction."
        control={
          <PercentInput
            percent={fractionToPercent(compaction?.keepRecentFraction ?? DEFAULT_KEEP_RECENT_FRACTION)}
            onChange={(v) => void setCompactionSettings({ keepRecentFraction: percentToFraction(v) })}
          />
        }
      />
      <SettingsDivider />
      <SettingsRow
        label="Summarizer model"
        description="Model used for the manual “Compact now” trigger. Same provider as the default connection above."
        control={
          availableModels.length === 0 ? (
            <span className="text-sm text-fg-subtle">—</span>
          ) : (
            <Select
              variant="compact"
              value={compaction?.summarizerModel ?? ''}
              onChange={(id) => void setCompactionSettings({ summarizerModel: id || undefined })}
              options={[
                { value: '', label: 'Same as chat model' },
                ...availableModels.map((m) => ({ value: m.id, label: m.name })),
              ]}
            />
          )
        }
      />
      <SettingsDivider />
      <CompactionAdvancedBounds compaction={compaction} />
    </SettingsCard>
  );
}

/** Bare % input, reused for Reserve % and Keep recent %. */
function PercentInput({ percent, onChange }: { percent: number; onChange: (percent: number) => void }) {
  return (
    <Input
      type="number"
      min={1}
      max={90}
      value={percent}
      onChange={(e) => {
        const v = parseInt(e.target.value, 10);
        if (Number.isFinite(v)) onChange(v);
      }}
      className="w-20 text-right"
    />
  );
}

/** Absolute floor/ceiling per fraction, expressed as an explicit "pin" —
 *  setting floor and ceiling to the same value fixes an exact token count
 *  regardless of model, without a separate "fixed mode" toggle. */
function CompactionAdvancedBounds({ compaction }: { compaction: AiSettings['compactionSettings'] }) {
  return (
    <>
      <div className="px-4 pt-3 text-xs font-medium text-fg-subtle">Advanced — token bounds</div>
      <SettingsRow
        label="Reserve floor / ceiling"
        description="Clamps Reserve %. Set both equal to pin an exact token count."
        control={
          <div className="flex items-center gap-1.5">
            <Input
              type="number"
              min={0}
              step={1000}
              value={compaction?.reserveTokensFloor ?? DEFAULT_RESERVE_TOKENS_FLOOR}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (Number.isFinite(v)) void setCompactionSettings({ reserveTokensFloor: v });
              }}
              className="w-24 text-right"
            />
            <span className="text-fg-subtle">–</span>
            <Input
              type="number"
              min={0}
              step={1000}
              value={compaction?.reserveTokensCeiling ?? DEFAULT_RESERVE_TOKENS_CEILING}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (Number.isFinite(v)) void setCompactionSettings({ reserveTokensCeiling: v });
              }}
              className="w-24 text-right"
            />
          </div>
        }
      />
      <SettingsDivider />
      <SettingsRow
        label="Keep-recent floor / ceiling"
        description="Clamps Keep recent %. Set both equal to pin an exact token count."
        control={
          <div className="flex items-center gap-1.5">
            <Input
              type="number"
              min={0}
              step={1000}
              value={compaction?.keepRecentTokensFloor ?? DEFAULT_KEEP_RECENT_TOKENS_FLOOR}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (Number.isFinite(v)) void setCompactionSettings({ keepRecentTokensFloor: v });
              }}
              className="w-24 text-right"
            />
            <span className="text-fg-subtle">–</span>
            <Input
              type="number"
              min={0}
              step={1000}
              value={compaction?.keepRecentTokensCeiling ?? DEFAULT_KEEP_RECENT_TOKENS_CEILING}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (Number.isFinite(v)) void setCompactionSettings({ keepRecentTokensCeiling: v });
              }}
              className="w-24 text-right"
            />
          </div>
        }
      />
    </>
  );
}
