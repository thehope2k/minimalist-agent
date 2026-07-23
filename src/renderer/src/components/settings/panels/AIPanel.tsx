import { useState } from 'react';
import { Plus } from 'lucide-react';
import {
  DEFAULT_MAX_TURNS,
  deleteConnection,
  refreshConnectionModels,
  setDefaultConnection,
  setDefaultModel,
  setDefaultPermissionMode,
  setDefaultThinking,
  setMaxTurns,
} from '@/lib/connections';
import { useAiData } from '@/hooks/useAiData';
import type { ConnectionMeta, PermissionMode, ThinkingLevel } from '@/lib/electron';
import { Button, Input, Select } from '@/components/ui';
import { AddConnectionDialog } from '../AddConnectionDialog';
import {
  SettingsCard,
  SettingsDivider,
  SettingsRow,
  SettingsSection,
} from '../SettingsPrimitives';
import { ConnectionRow } from '../ai-panel/ConnectionRow';
import { ContextFileNamesRow } from '../ai-panel/ContextFileNamesRow';
import { CompactionSection } from '../ai-panel/CompactionSection';

const THINKING_LEVELS: ThinkingLevel[] = ['off', 'low', 'medium', 'high', 'xhigh', 'max'];

/** Mirrors main's model-refresh.isRefreshable: only providers with a live catalog. */
function isRefreshable(conn: ConnectionMeta): boolean {
  if (conn.providerType === 'pi' && conn.piAuthProvider === 'github-copilot') return true;
  return conn.providerType === 'openai-compatible' || conn.providerType === 'local';
}

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

  const testConnection = async (conn: ConnectionMeta) => {
    try {
      const res = await window.api.connections.test(conn.slug);
      if (res.ok) {
        window.alert(`✓ "${conn.name}" is working.`);
      } else {
        window.alert(
          `✗ "${conn.name}" failed.\n\n${res.error?.title ?? 'Error'}\n${res.error?.message ?? ''}`,
        );
      }
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Test failed.');
    }
  };

  const refreshModels = async (conn: ConnectionMeta) => {
    try {
      const res = await refreshConnectionModels(conn.slug);
      if (res.ok) {
        window.alert(
          res.changed
            ? `✓ "${conn.name}" model list updated.`
            : `"${conn.name}" is already up to date.`,
        );
      } else if (res.reason === 'unsupported') {
        window.alert(`"${conn.name}" uses a fixed model list — nothing to refresh.`);
      } else {
        window.alert(`Could not refresh "${conn.name}".\n\n${res.error ?? 'Unknown error.'}`);
      }
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Refresh failed.');
    }
  };

  if (!data) {
    return <div className="px-8 py-10 text-sm text-fg-subtle">Loading…</div>;
  }

  const { connections, defaultSlug, settings, encryptionAvailable } = data;
  const defaultConn = connections.find((c) => c.slug === defaultSlug) ?? connections[0];
  const availableModels = defaultConn?.models ?? [];
  const currentModelId = settings.defaultModel ?? defaultConn?.defaultModel;

  return (
    <div className="mx-auto max-w-190 px-8 py-10">
      <SettingsSection
        title="Connections"
        subtitle="Manage your AI provider connections."
        action={
          <Button
            variant="outline"
            icon={Plus}
            onClick={() => setDialogOpen(true)}
            className="bg-elevated/40"
          >
            Add Connection
          </Button>
        }
      >
        {!encryptionAvailable && connections.length > 0 && (
          <div className="mb-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
            OS keychain encryption is unavailable on this machine — API keys and
            OAuth tokens are stored as <b>plaintext</b> on disk (owner-readable
            only). Avoid storing long-lived secrets here; prefer a host with a
            working keychain.
          </div>
        )}
        <div className="space-y-2">
          {connections.length === 0 ? (
            <SettingsCard>
              <div className="px-4 py-6 text-center text-sm text-fg-subtle">
                No connections yet. Add one to get started.
              </div>
            </SettingsCard>
          ) : (
            connections.map((c) => (
              <ConnectionRow
                key={c.slug}
                conn={c}
                isDefault={c.slug === (defaultSlug ?? defaultConn?.slug)}
                onMakeDefault={() => {
                  void setDefaultConnection(c.slug);
                  const stillValid = c.models.some(
                    (m) => m.id === data?.settings.defaultModel,
                  );
                  if (!stillValid) void setDefaultModel(c.defaultModel);
                }}
                onDelete={() => {
                  if (confirm(`Delete connection "${c.name}"?`)) {
                    void deleteConnection(c.slug);
                  }
                }}
                onTest={() => void testConnection(c)}
                onReauth={() => setReauthSlug(c.slug)}
                onRefreshModels={
                  isRefreshable(c) ? () => void refreshModels(c) : undefined
                }
              />
            ))
          )}
        </div>
      </SettingsSection>

      <SettingsSection
        title="New Chat Defaults"
        subtitle="Settings for new chats when no workspace override is set."
      >
        <SettingsCard>
          <SettingsRow
            label="Connection"
            description="API connection for new chats"
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
            description="AI model for new chats"
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
            description="Reasoning depth for new chats"
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

      <SettingsSection title="Agent" subtitle="Tool-loop bound and prompt customization for new chats.">
        <SettingsCard>
          <SettingsRow
            label="Default permission mode"
            description="Plan = read-only research · Auto = intelligent execution with autonomy control. Applied to brand-new chats; switch per-session above the composer."
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
          <SettingsDivider />
          <SettingsRow
            label="Max turns per message"
            description="Caps the tool-use loop per response (Anthropic only — ignored for Pi and Copilot). The agent stops with stop_reason=max_turns when reached."
            control={
              <Input
                type="number"
                min={1}
                max={200}
                value={settings.maxTurns ?? DEFAULT_MAX_TURNS}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  void setMaxTurns(Number.isFinite(v) ? v : undefined);
                }}
                className="w-24 text-right"
              />
            }
          />
          <SettingsDivider />
          <ContextFileNamesRow current={settings.contextFileNames} />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection
        title="Context & Compaction"
        subtitle="Tuning for the Pi backend's automatic conversation summarization (GitHub Copilot, local, OpenAI-compatible connections). Ignored for Anthropic. Percentages are resolved against whichever model is active in a chat."
      >
        <CompactionSection
          settings={settings}
          availableModels={availableModels}
        />
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

