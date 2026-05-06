import { useState } from 'react';
import { Activity, KeyRound, LogIn, MoreHorizontal, Plus, Sparkles, Star, Trash2, X } from 'lucide-react';
import {
  DEFAULT_MAX_TURNS,
  deleteConnection,
  setContextFileNames,
  setSddScanDepth,
  setDefaultConnection,
  setDefaultModel,
  setDefaultPermissionMode,
  setDefaultThinking,
  setExtendedContext,
  setMaxTurns,
} from '@/lib/connections';
import { useAiData } from '@/hooks/useAiData';
import type { ConnectionMeta, PermissionMode, ThinkingLevel } from '@/lib/electron';
import { Badge, Button, IconButton, Input, Menu, Select, type MenuItem } from '@/components/ui';
import { AddConnectionDialog } from '../AddConnectionDialog';
import { CopilotQuotaBar } from '../CopilotQuotaBar';
import {
  SettingsCard,
  SettingsDivider,
  SettingsRow,
  SettingsSection,
  SettingsToggle,
} from '../SettingsPrimitives';

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

const PERMISSION_MODES: PermissionMode[] = ['plan', 'ask', 'auto'];

const PERMISSION_LABELS: Record<PermissionMode, string> = {
  plan: 'Plan',
  ask: 'Ask',
  auto: 'Auto',
};

const PERMISSION_DESCRIPTIONS: Record<PermissionMode, string> = {
  plan: 'Read-only research; agent proposes a plan',
  ask: 'Confirm each tool call (recommended)',
  auto: 'Run all tools without asking',
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

  if (!data) {
    return <div className="px-8 py-10 text-sm text-fg-subtle">Loading…</div>;
  }

  const { connections, defaultSlug, settings } = data;
  const defaultConn = connections.find((c) => c.slug === defaultSlug) ?? connections[0];
  const availableModels = defaultConn?.models ?? [];
  const currentModelId = settings.defaultModel ?? defaultConn?.defaultModel;

  return (
    <div className="mx-auto max-w-190 px-8 py-10">
      <SettingsSection
        title="Default"
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

      <SettingsSection title="Connections" subtitle="Manage your AI provider connections.">
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
              />
            ))
          )}

          <Button
            variant="outline"
            icon={Plus}
            onClick={() => setDialogOpen(true)}
            className="bg-elevated/40"
          >
            Add Connection
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection title="Agent" subtitle="Tool-loop bound and prompt customization for new chats.">
        <SettingsCard>
          <SettingsRow
            label="Default permission mode"
            description="Plan = read-only · Ask = confirm each tool · Auto = run without asking. Applied to brand-new chats; switch per-session above the composer."
            control={
              <Select
                variant="compact"
                value={settings.defaultPermissionMode ?? 'ask'}
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

      <SettingsSection title="Performance" subtitle="Cost and caching options.">
        <SettingsCard>
          <SettingsToggle
            label="Extended context (1M)"
            description="Use 1M token context window for Opus 4.7. Disable to use 200K and conserve usage limits."
            checked={!!settings.extendedContext}
            onCheckedChange={(v) => void setExtendedContext(v)}
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="SDD" subtitle="Spec-Driven Development scan behaviour.">
        <SettingsCard>
          <SettingsRow
            label="Workspace scan depth"
            description="Directory levels MA walks when looking for .specify/ entities. Increase for deeply nested monorepos (default: 3)."
            control={
              <Input
                type="number"
                min={1}
                max={8}
                value={settings.sddScanDepth ?? 3}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  void setSddScanDepth(Number.isFinite(v) && v >= 1 ? v : 3);
                }}
                className="w-20 text-right"
              />
            }
          />
        </SettingsCard>
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

function ConnectionRow({
  conn,
  isDefault,
  onMakeDefault,
  onDelete,
  onTest,
  onReauth,
}: {
  conn: ConnectionMeta;
  isDefault?: boolean;
  onMakeDefault: () => void;
  onDelete: () => void;
  onTest: () => void;
  onReauth: () => void;
}) {
  const reauthLabel =
    conn.authType === 'oauth' ? 'Reconnect' : 'Update API key';
  const reauthIcon = conn.authType === 'oauth' ? LogIn : KeyRound;

  const items: Array<MenuItem | 'separator'> = [
    // Hide the "Make default" entry when this row is already the default,
    // so there's exactly one zero-state per connection.
    ...(isDefault
      ? []
      : [{ label: 'Make default', icon: Star, onSelect: onMakeDefault }]),
    { label: 'Test connection', icon: Activity, onSelect: onTest },
    { label: reauthLabel, icon: reauthIcon, onSelect: onReauth },
    'separator',
    { label: 'Delete', icon: Trash2, variant: 'destructive', onSelect: onDelete },
  ];

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-panel px-4 py-3">
      <span className="grid h-7 w-7 place-items-center rounded-md bg-orange-500/15 text-orange-400">
        <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-fg">{conn.name}</span>
          {isDefault && <Badge>Default</Badge>}
        </div>
        <div className="text-xs text-fg-subtle">
          {providerLabel(conn)} · {conn.models.length} models
        </div>
        {conn.providerType === 'pi' && conn.piAuthProvider === 'github-copilot' && (
          <CopilotQuotaBar connectionSlug={conn.slug} />
        )}
      </div>
      <Menu
        trigger={<IconButton icon={MoreHorizontal} label="More" />}
        items={items}
      />
    </div>
  );
}

function providerLabel(conn: ConnectionMeta): string {
  if (conn.providerType === 'pi') {
    return conn.piAuthProvider === 'github-copilot' ? 'GitHub Copilot' : 'Pi';
  }
  return conn.authType === 'oauth' ? 'Claude OAuth' : 'Anthropic API';
}

const DEFAULT_NAMES = ['agents.md', 'claude.md', 'copilot-instructions.md'];

function ContextFileNamesRow({ current }: { current?: string[] }) {
  const names = current ?? DEFAULT_NAMES;
  const [input, setInput] = useState('');

  const add = () => {
    const trimmed = input.trim().toLowerCase();
    if (!trimmed || names.includes(trimmed)) { setInput(''); return; }
    void setContextFileNames([...names, trimmed]);
    setInput('');
  };

  const remove = (name: string) => {
    void setContextFileNames(names.filter((n) => n !== name));
  };

  return (
    <div className="px-4 py-3">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-sm text-fg">Context file names</span>
      </div>
      <p className="mb-3 text-xs text-fg-subtle">
        Filenames MA scans for project context each turn (case-insensitive, any directory depth).
        Add your team's convention: <code className="text-fg-muted">copilot-instructions.md</code>,
        <code className="text-fg-muted"> .cursorrules</code>, etc.
      </p>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {names.map((name) => (
          <span
            key={name}
            className="flex items-center gap-1 rounded-md border border-border bg-elevated px-2 py-0.5 text-xs text-fg"
          >
            {name}
            {!DEFAULT_NAMES.includes(name) && (
              <button
                type="button"
                onClick={() => remove(name)}
                className="text-fg-subtle hover:text-fg transition-colors"
                aria-label={`Remove ${name}`}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
          placeholder="e.g. copilot-instructions.md"
          className="flex-1 text-xs"
        />
        <button
          type="button"
          onClick={add}
          disabled={!input.trim()}
          className="flex items-center gap-1 rounded-md border border-border bg-elevated px-2.5 py-1.5 text-xs text-fg-muted hover:text-fg disabled:opacity-40 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>
    </div>
  );
}
