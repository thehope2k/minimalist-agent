import { useState } from 'react';
import {
  setDefaultConnection,
  setDefaultModel,
  setDefaultPermissionMode,
  setDefaultThinking,
} from '@/lib/connections';
import { useAiData } from '@/hooks/useAiData';
import type { PermissionMode, ThinkingLevel } from '@/lib/electron';
import { Button, Select } from '@/components/ui';
import { AddConnectionDialog } from '../AddConnectionDialog';
import {
  SettingsCard,
  SettingsDivider,
  SettingsRow,
  SettingsSection,
} from '../SettingsPrimitives';
import { ConnectionsSection } from '../ai-panel/ConnectionsSection';
import { ContextFileNamesRow } from '../ai-panel/ContextFileNamesRow';
import { CompactionSection } from '../ai-panel/CompactionSection';

const THINKING_LEVELS: ThinkingLevel[] = ['off', 'low', 'medium', 'high', 'xhigh', 'max'];

const THINKING_LABELS: Record<ThinkingLevel, string> = {
  off: 'No Thinking',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra High',
  max: 'Max',
};

const THINKING_DESCRIPTIONS: Record<ThinkingLevel, string> = {
  off: 'Fastest responses, no reasoning',
  low: 'Light reasoning, faster responses',
  medium: 'Balanced speed and reasoning',
  high: 'Deep reasoning for complex tasks',
  xhigh: 'Deeper reasoning for long-horizon agentic tasks',
  max: 'Maximum reasoning budget',
};

const PERMISSION_MODES: PermissionMode[] = ['plan', 'auto'];

const PERMISSION_LABELS: Record<PermissionMode, string> = {
  plan: 'Plan',
  auto: 'Auto',
};

const PERMISSION_DESCRIPTIONS: Record<PermissionMode, string> = {
  plan: 'Read-only research; agent proposes a plan',
  auto: 'Intelligent execution with configurable autonomy',
};

export function AIPanel() {
  const data = useAiData();
  const [dialogOpen, setDialogOpen] = useState(false);
  /** When set, AddConnectionDialog opens in "edit" mode for this slug. */
  const [reauthSlug, setReauthSlug] = useState<string | null>(null);

  if (!data) {
    return <div className="px-8 py-10 text-sm text-fg-subtle">Loading…</div>;
  }

  const { connections, defaultSlug, settings, encryptionAvailable } = data;
  const defaultConn = connections.find((c) => c.slug === defaultSlug) ?? connections[0];
  const availableModels = defaultConn?.models ?? [];
  const currentModelId = settings.defaultModel ?? defaultConn?.defaultModel;

  return (
    <div className="mx-auto max-w-190 px-8 py-10">
      <ConnectionsSection
        connections={connections}
        defaultSlug={defaultSlug}
        defaultModel={settings.defaultModel}
        encryptionAvailable={encryptionAvailable}
        onAdd={() => setDialogOpen(true)}
        onReauth={setReauthSlug}
      />

      <SettingsSection
        title="New Session Defaults"
        subtitle="Settings for new sessions when no workspace override is set."
      >
        <SettingsCard>
          <SettingsRow
            label="Connection"
            description="API connection for new sessions"
            control={
              connections.length === 0 ? (
                <Button variant="link" onClick={() => setDialogOpen(true)}>
                  Add a connection
                </Button>
              ) : (
                <Select
                  variant="compact"
                  value={defaultSlug ?? defaultConn?.slug ?? ''}
                  onChange={(slug) => void setDefaultConnection(slug)}
                  options={connections.map((c) => ({ value: c.slug, label: c.name }))}
                />
              )
            }
          />
          <SettingsDivider />
          <SettingsRow
            label="Model"
            description="AI model for new sessions"
            control={
              availableModels.length === 0 ? (
                <span className="text-sm text-fg-subtle">—</span>
              ) : (
                <Select
                  variant="compact"
                  value={currentModelId ?? ''}
                  onChange={(id) => void setDefaultModel(id)}
                  options={availableModels.map((m) => ({ value: m.id, label: m.name }))}
                />
              )
            }
          />
          <SettingsDivider />
          <SettingsRow
            label="Thinking"
            description="Reasoning depth for new sessions"
            control={
              <Select
                variant="compact"
                value={settings.defaultThinking}
                onChange={(v) => void setDefaultThinking(v as ThinkingLevel)}
                options={THINKING_LEVELS.map((l) => ({
                  value: l,
                  label: THINKING_LABELS[l],
                  description: THINKING_DESCRIPTIONS[l],
                }))}
              />
            }
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Agent" subtitle="Tool-loop bound and prompt customization for new sessions.">
        <SettingsCard>
          <SettingsRow
            label="Default permission mode"
            description="Plan = read-only research · Auto = intelligent execution with autonomy control. Applied to brand-new sessions; switch per-session above the composer."
            control={
              <Select
                variant="compact"
                value={settings.defaultPermissionMode ?? 'auto'}
                onChange={(v) => void setDefaultPermissionMode(v as PermissionMode)}
                options={PERMISSION_MODES.map((m) => ({
                  value: m,
                  label: PERMISSION_LABELS[m],
                  description: PERMISSION_DESCRIPTIONS[m],
                }))}
              />
            }
          />
          <ContextFileNamesRow current={settings.contextFileNames} />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection
        title="Context & Compaction"
        subtitle="Tune automatic conversation summarization. Percentages are resolved against whichever model is active."
      >
        <CompactionSection settings={settings} />
      </SettingsSection>

      <AddConnectionDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        makeDefault={connections.length === 0}
        onSaved={() => setDialogOpen(false)}
      />

      <AddConnectionDialog
        open={reauthSlug != null}
        editingMeta={
          reauthSlug ? connections.find((c) => c.slug === reauthSlug) : undefined
        }
        onClose={() => setReauthSlug(null)}
        onSaved={() => setReauthSlug(null)}
      />
    </div>
  );
}

