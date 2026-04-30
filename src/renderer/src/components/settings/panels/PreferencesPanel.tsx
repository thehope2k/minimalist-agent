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
        subtitle="Pinned to the system prompt so the model can address you correctly and respond in your preferred language."
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
          <PrefRow
            label="Timezone"
            description='IANA name, e.g. "America/Los_Angeles". Leave blank to use the system default.'
            value={prefs.timezone ?? ''}
            placeholder="America/Los_Angeles"
            onCommit={(v) => void updatePreferences({ timezone: v || undefined })}
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
        </SettingsCard>
      </SettingsSection>

      <SettingsSection
        title="Location"
        subtitle="Optional. Helpful for time, weather, and locale-aware questions."
      >
        <SettingsCard>
          <PrefRow
            label="City"
            value={prefs.location?.city ?? ''}
            placeholder="San Francisco"
            onCommit={(v) =>
              void updatePreferences({ location: { city: v || undefined } })
            }
          />
          <SettingsDivider />
          <PrefRow
            label="Region / State"
            value={prefs.location?.region ?? ''}
            placeholder="California"
            onCommit={(v) =>
              void updatePreferences({ location: { region: v || undefined } })
            }
          />
          <SettingsDivider />
          <PrefRow
            label="Country"
            value={prefs.location?.country ?? ''}
            placeholder="United States"
            onCommit={(v) =>
              void updatePreferences({ location: { country: v || undefined } })
            }
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection
        title="Notes about you"
        subtitle="Free-form text added to every system prompt under “Notes about this user”. Use it for stable preferences (response style, expertise level, recurring constraints)."
      >
        <SettingsCard>
          <div className="px-4 py-3">
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
          </div>
        </SettingsCard>
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

/** Inline-editable text row that commits on blur or Enter. */
function PrefRow(props: {
  label: string;
  description?: string;
  value: string;
  placeholder?: string;
  onCommit: (next: string) => void;
}) {
  // Remount whenever the persisted value changes externally so the local
  // draft state stays in sync without manual reconciliation.
  return <PrefRowInner key={props.value} {...props} />;
}

function PrefRowInner({
  label,
  description,
  value,
  placeholder,
  onCommit,
}: {
  label: string;
  description?: string;
  value: string;
  placeholder?: string;
  onCommit: (next: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  return (
    <SettingsRow
      label={label}
      description={description}
      control={
        <Input
          value={draft}
          placeholder={placeholder}
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
          className="w-64 text-right"
        />
      }
    />
  );
}
