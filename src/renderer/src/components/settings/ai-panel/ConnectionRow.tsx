import { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import {
  Activity,
  ChevronDown,
  KeyRound,
  LogIn,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Star,
  Trash2,
} from 'lucide-react';
import { BrandMark } from '../connection-flow/shared';
import { CopilotQuotaBar } from '../CopilotQuotaBar';
import { ChatGptQuotaBar } from '../ChatGptQuotaBar';
import { ClaudeUsageBar } from '../ClaudeUsageBar';
import { CodeMieBudgetBar } from '../CodeMieBudgetBar';
import {
  Badge,
  DragHandle,
  IconButton,
  Menu,
  type DragHandleProps,
  type MenuItem,
} from '@/components/ui';
import type { ConnectionMeta } from '@/lib/electron';
import { providerLabel } from './utils';

export function ConnectionRow({
  conn,
  isDefault,
  dragHandle,
  onMakeDefault,
  onDelete,
  onRename,
  onTest,
  onReauth,
  onRefreshModels,
}: {
  conn: ConnectionMeta;
  isDefault?: boolean;
  dragHandle?: DragHandleProps;
  onMakeDefault: () => void;
  onDelete: () => void;
  onRename: (name: string) => void;
  onTest: () => void;
  onReauth: () => void;
  onRefreshModels?: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [modelsOpen, setModelsOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(conn.name);

  const startRename = () => {
    setRenameValue(conn.name);
    setRenaming(true);
  };
  const commitRename = () => {
    setRenaming(false);
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === conn.name) return;
    onRename(trimmed);
  };

  const reauthLabel = conn.authType === 'oauth' ? 'Reconnect' : 'Update API key';
  const reauthIcon = conn.authType === 'oauth' ? LogIn : KeyRound;

  const items: Array<MenuItem | 'separator'> = [
    { label: 'Rename', icon: Pencil, onSelect: startRename },
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
      {dragHandle && <DragHandle dragHandle={dragHandle} className="-ml-1.5 shrink-0" />}
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-elevated text-fg-muted">
        <BrandMark conn={conn} />
      </span>
      <div className="min-w-0 flex-1">
        {renaming ? (
          <input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
              if (e.key === 'Escape') { e.preventDefault(); setRenaming(false); }
            }}
            onBlur={commitRename}
            className="w-full rounded border border-accent bg-elevated px-1.5 py-0.5 text-sm font-medium text-fg outline-none"
          />
        ) : (
          <div className="flex items-center gap-2">
            <span
              className="truncate text-sm font-medium text-fg"
              onDoubleClick={startRename}
            >
              {conn.name}
            </span>
            {isDefault && <Badge>Default</Badge>}
          </div>
        )}
        <div className="flex items-center gap-1 text-xs text-fg-subtle">
          <span>{providerLabel(conn)} ·</span>
          <Popover.Root open={modelsOpen} onOpenChange={setModelsOpen}>
            <Popover.Trigger asChild>
              <button
                type="button"
                aria-expanded={modelsOpen}
                className="inline-flex items-center gap-0.5 rounded px-1 text-fg-muted transition-colors hover:bg-elevated hover:text-fg"
              >
                {conn.models.length} {conn.models.length === 1 ? 'model' : 'models'}
                <ChevronDown
                  className="h-3 w-3"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                align="start"
                side="bottom"
                sideOffset={6}
                collisionPadding={8}
                className="z-50 w-80 overflow-hidden rounded-lg border border-border bg-panel p-1 shadow-2xl"
              >
                <div className="border-b border-border px-2.5 py-2 text-xs font-medium text-fg">
                  {conn.models.length} {conn.models.length === 1 ? 'model' : 'models'} available
                </div>
                <div className="scroll-thin max-h-80 overflow-auto py-1">
                  {conn.models.length === 0 ? (
                    <div className="px-2.5 py-3 text-sm text-fg-subtle">
                      No models on this connection.
                    </div>
                  ) : (
                    conn.models.map((model) => (
                      <div key={model.id} className="px-2.5 py-1.5">
                        <div className="truncate text-sm text-fg">{model.name}</div>
                        {model.name !== model.id && (
                          <div className="truncate text-xs text-fg-subtle">{model.id}</div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>
        {conn.providerType === 'pi' && conn.piAuthProvider === 'github-copilot' && (
          <CopilotQuotaBar connectionSlug={conn.slug} />
        )}
        {conn.providerType === 'pi' && conn.piAuthProvider === 'openai-codex' && (
          <ChatGptQuotaBar connectionSlug={conn.slug} />
        )}
        {conn.providerType === 'anthropic' && conn.authType === 'oauth' && (
          <ClaudeUsageBar connectionSlug={conn.slug} />
        )}
        {conn.providerType === 'codemie-sso' && (
          <CodeMieBudgetBar connectionSlug={conn.slug} />
        )}
      </div>
      <Menu trigger={<IconButton icon={MoreHorizontal} label="More" />} items={items} />
    </div>
  );
}
