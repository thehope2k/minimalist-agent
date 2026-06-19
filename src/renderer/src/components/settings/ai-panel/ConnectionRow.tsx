import { Activity, KeyRound, LogIn, MoreHorizontal, RefreshCw, Star, Trash2 } from 'lucide-react';
import { BrandMark } from '../connection-flow/shared';
import { CopilotQuotaBar } from '../CopilotQuotaBar';
import { ClaudeUsageBar } from '../ClaudeUsageBar';
import { Badge, IconButton, Menu, type MenuItem } from '@/components/ui';
import type { ConnectionMeta } from '@/lib/electron';
import { providerLabel } from './utils';

export function ConnectionRow({
  conn,
  isDefault,
  onMakeDefault,
  onDelete,
  onTest,
  onReauth,
  onRefreshModels,
}: {
  conn: ConnectionMeta;
  isDefault?: boolean;
  onMakeDefault: () => void;
  onDelete: () => void;
  onTest: () => void;
  onReauth: () => void;
  onRefreshModels?: () => void;
}) {
  const reauthLabel = conn.authType === 'oauth' ? 'Reconnect' : 'Update API key';
  const reauthIcon = conn.authType === 'oauth' ? LogIn : KeyRound;

  const items: Array<MenuItem | 'separator'> = [
    ...(isDefault ? [] : [{ label: 'Make default', icon: Star, onSelect: onMakeDefault }]),
    { label: 'Test connection', icon: Activity, onSelect: onTest },
    ...(onRefreshModels
      ? [{ label: 'Refresh models', icon: RefreshCw, onSelect: onRefreshModels }]
      : []),
    { label: reauthLabel, icon: reauthIcon, onSelect: onReauth },
    'separator',
    { label: 'Delete', icon: Trash2, variant: 'destructive', onSelect: onDelete },
  ];

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-panel px-4 py-3">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-elevated text-fg-muted">
        <BrandMark conn={conn} />
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
        {conn.providerType === 'anthropic' && conn.authType === 'oauth' && (
          <ClaudeUsageBar connectionSlug={conn.slug} />
        )}
      </div>
      <Menu trigger={<IconButton icon={MoreHorizontal} label="More" />} items={items} />
    </div>
  );
}
