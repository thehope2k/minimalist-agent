import { useState } from 'react';
import { Input, Select, Textarea } from '@/components/ui';
import { usePreferences } from '@/hooks/usePreferences';
import { updatePreferences } from '@/lib/preferences';
import {
  SettingsCard,
  SettingsDivider,
  SettingsRow,
  SettingsSection,
  SettingsToggle,
} from '../SettingsPrimitives';

const LANGUAGE_OPTIONS = [
  { code: 'en', nativeName: 'English' },
  { code: 'ja', nativeName: '日本語' },
  { code: 'zh', nativeName: '中文' },
  { code: 'ko', nativeName: '한국어' },
  { code: 'es', nativeName: 'Español' },
  { code: 'fr', nativeName: 'Français' },
  { code: 'de', nativeName: 'Deutsch' },
  { code: 'pt', nativeName: 'Português' },
  { code: 'ru', nativeName: 'Русский' },
  { code: 'ar', nativeName: 'العربية' },
  { code: 'hi', nativeName: 'हिन्दी' },
  { code: 'it', nativeName: 'Italiano' },
  { code: 'nl', nativeName: 'Nederlands' },
  { code: 'pl', nativeName: 'Polski' },
  { code: 'tr', nativeName: 'Türkçe' },
  { code: 'vi', nativeName: 'Tiếng Việt' },
] as const;

type LanguageCode = (typeof LANGUAGE_OPTIONS)[number]['code'];

export function PreferencesPanel() {
  const prefs = usePreferences();

  if (!prefs) {
    return (
      <div className="p-6 text-sm text-fg-subtle">Loading preferences…</div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-6">
      <SettingsSection
        title="About you"
        subtitle="Pinned to the system prompt so the model can address you correctly, respond in your preferred language, and reason about time/weather/locale questions."
      >
        <SettingsCard>
          <PrefRow
            label="Name"
            description="What the assistant should call you."
            value={prefs.name ?? ''}
            placeholder="e.g. Alex"
            onCommit={(v) => void updatePreferences({ name: v || undefined })}
          />
          <SettingsDivider />
          <SettingsRow
            label="Preferred language"
            description="The model will respond in this language by default."
            control={
              <Select<LanguageCode>
                value={(prefs.language as LanguageCode) ?? 'en'}
                onChange={(v) => void updatePreferences({ language: v })}
                options={LANGUAGE_OPTIONS.map((l) => ({
                  value: l.code,
                  label: l.nativeName,
                }))}
                menuWidth={200}
              />
            }
          />
          <SettingsDivider />
          <PrefRow
            label="Location"
            description="Optional — e.g. city, country."
            value={prefs.location ?? ''}
            placeholder="e.g. Hanoi, Vietnam"
            controlClassName="w-80 text-right"
            onCommit={(v) => void updatePreferences({ location: v || undefined })}
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection
        title="Notes about you"
        subtitle="Included in every conversation, so you don't need to repeat yourself. Use it for things like your experience level, how you like answers explained, or habits you want the assistant to always follow."
      >
        <Textarea
          rows={5}
          placeholder="e.g. I'm a senior engineer; skip beginner explanations. Prefer concise answers."
          defaultValue={prefs.notes ?? ''}
          onBlur={(e) =>
            void updatePreferences({
              notes: e.target.value.trim() || undefined,
            })
          }
        />
      </SettingsSection>

      <SettingsSection
        title="Git"
        subtitle="Behavior when the assistant creates commits on your behalf."
      >
        <SettingsCard>
          <SettingsToggle
            label="Include Co-Authored-By trailer"
            description="Adds 'Co-Authored-By: Minimalist Agent <noreply@minimalist-agent.local>' to commit messages."
            checked={prefs.includeCoAuthoredBy ?? true}
            onCheckedChange={(v) =>
              void updatePreferences({ includeCoAuthoredBy: v })
            }
          />
        </SettingsCard>
      </SettingsSection>
    </div>
  );
}

/**
 * Text input that tracks a local draft and commits (trimmed) on blur or
 * Enter, reverting on Escape. Remounts (via the `key`) whenever the
 * persisted value changes externally so the draft stays in sync without
 * manual reconciliation.
 */
function CommitInput({
  value,
  placeholder,
  className,
  onCommit,
}: {
  value: string;
  placeholder?: string;
  className?: string;
  onCommit: (next: string) => void;
}) {
  return (
    <CommitInputInner
      key={value}
      value={value}
      placeholder={placeholder}
      className={className}
      onCommit={onCommit}
    />
  );
}

function CommitInputInner({
  value,
  placeholder,
  className,
  onCommit,
}: {
  value: string;
  placeholder?: string;
  className?: string;
  onCommit: (next: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  return (
    <Input
      value={draft}
      placeholder={placeholder}
      className={className}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const trimmed = draft.trim();
        if (trimmed !== value) onCommit(trimmed);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          setDraft(value);
          e.currentTarget.blur();
        }
      }}
    />
  );
}

/** Labeled settings row wrapping a {@link CommitInput}. */
function PrefRow({
  label,
  description,
  value,
  placeholder,
  controlClassName = 'w-64 text-right',
  onCommit,
}: {
  label: string;
  description?: string;
  value: string;
  placeholder?: string;
  controlClassName?: string;
  onCommit: (next: string) => void;
}) {
  return (
    <SettingsRow
      label={label}
      description={description}
      control={
        <CommitInput
          value={value}
          placeholder={placeholder}
          className={controlClassName}
          onCommit={onCommit}
        />
      }
    />
  );
}
