import { Plus } from 'lucide-react';
import {
  deleteConnection,
  refreshConnectionModels,
  renameConnection,
  reorderConnections,
  setDefaultConnection,
  setDefaultModel,
} from '@/lib/connections';
import { Button, SortableList } from '@/components/ui';
import type { ConnectionMeta } from '@/lib/electron';
import { SettingsCard, SettingsSection } from '../SettingsPrimitives';
import { ConnectionRow } from './ConnectionRow';

/** Stable identity for SortableList — must not be an inline arrow (memo churn). */
const getConnectionId = (conn: ConnectionMeta): string => conn.slug;

/** Mirrors main's model-refresh.isRefreshable: only providers with a live catalog. */
function isRefreshable(conn: ConnectionMeta): boolean {
  if (conn.providerType === 'github-copilot') return true;
  return conn.providerType === 'openai-compatible' || conn.providerType === 'local' || conn.providerType === 'codemie-sso';
}

interface ConnectionsSectionProps {
  connections: ConnectionMeta[];
  defaultSlug?: string | null;
  defaultModel?: string | null;
  encryptionAvailable: boolean;
  onAdd: () => void;
  onReauth: (slug: string) => void;
}

export function ConnectionsSection({
  connections,
  defaultSlug,
  defaultModel,
  encryptionAvailable,
  onAdd,
  onReauth,
}: ConnectionsSectionProps) {
  const defaultConn = connections.find((conn) => conn.slug === defaultSlug) ?? connections[0];

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
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Test failed.');
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
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Refresh failed.');
    }
  };

  return (
    <SettingsSection
      title="Connections"
      subtitle="Manage your AI provider connections."
      action={
        <Button variant="outline" icon={Plus} onClick={onAdd} className="bg-elevated/40">
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
          <SortableList
            items={connections}
            getId={getConnectionId}
            onReorder={(next) => void reorderConnections(next.map((conn) => conn.slug))}
            className="space-y-2"
            renderItem={(conn, dragHandle) => (
              <ConnectionRow
                conn={conn}
                dragHandle={dragHandle}
                isDefault={conn.slug === (defaultSlug ?? defaultConn?.slug)}
                onMakeDefault={() => {
                  void setDefaultConnection(conn.slug);
                  const stillValid = conn.models.some((model) => model.id === defaultModel);
                  if (!stillValid) void setDefaultModel(conn.defaultModel);
                }}
                onRename={(name) => void renameConnection(conn.slug, name)}
                onDelete={() => {
                  if (confirm(`Delete connection "${conn.name}"?`)) {
                    void deleteConnection(conn.slug);
                  }
                }}
                onTest={() => void testConnection(conn)}
                onReauth={() => onReauth(conn.slug)}
                onRefreshModels={isRefreshable(conn) ? () => void refreshModels(conn) : undefined}
              />
            )}
          />
        )}
      </div>
    </SettingsSection>
  );
}
