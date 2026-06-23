import { useEffect, useState } from 'react';
import { Plug, Plus, RefreshCw } from 'lucide-react';
import { useExtensions } from '@/hooks/useExtensions';
import {
  displayDescription,
  displayName,
  isEnabled,
  reload as reloadExtensions,
} from '@/lib/extensions';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui';
import { ExtensionAvatar } from './ExtensionAvatar';
import { ExtensionMenu } from './ExtensionMenu';
import { AddExtensionDialog } from './AddExtensionDialog';
import type { LoadedExtension } from '@/lib/electron';
import type { SeedSubmit } from '@/App';

type Props = {
  activeSlug: string | null;
  onSelect: (slug: string | null) => void;
  onStartChatWithSubmission?: (submit: SeedSubmit) => void;
};

const VARIANT_LABEL: Record<LoadedExtension['variant'], string> = {
  'guide-only': 'guide',
  'cli-bound': 'cli',
  'mcp-backed': 'mcp',
};

type McpStatus = {
  slug: string;
  ok: boolean;
  reason?: 'disabled' | 'missing-secrets' | 'no-consent' | 'connect-failed';
  toolCount?: number;
  error?: string;
};

/** Compact badge describing why an mcp-backed extension's tools aren't loaded
 *  (or that they are). Returns null for non-mcp extensions or unknown status. */
function McpStatusBadge({ status }: { status: McpStatus | undefined }) {
  if (!status || status.reason === 'disabled') return null;
  if (status.ok) {
    // toolCount is only known after a session actually connects the server.
    // Until then the extension is merely eligible ("ready"), not verified
    // — consent/secrets can be satisfied while the server still fails to
    // start or authenticate on first real use.
    const connected = status.toolCount != null;
    return (
      <span
        className={
          connected
            ? 'rounded bg-emerald-500/15 px-1.5 py-px text-[10px] uppercase tracking-wide text-emerald-300'
            : 'rounded bg-elevated/80 px-1.5 py-px text-[10px] uppercase tracking-wide text-fg-subtle'
        }
        title={
          connected
            ? `MCP server connected — ${status.toolCount} tool(s)`
            : 'Eligible: consent and secrets satisfied. The server connects on first use this session.'
        }
      >
        {connected ? 'active' : 'ready'}
      </span>
    );
  }
  const label =
    status.reason === 'no-consent'
      ? 'consent'
      : status.reason === 'missing-secrets'
        ? 'secret'
        : 'failed';
  const title =
    status.reason === 'no-consent'
      ? 'MCP tools blocked: consent not granted. Open this extension to approve the server.'
      : status.reason === 'missing-secrets'
        ? 'MCP tools blocked: a required secret is not set.'
        : `MCP server failed to start${status.error ? `: ${status.error}` : ''}`;
  return (
    <span
      className="rounded bg-amber-500/15 px-1.5 py-px text-[10px] uppercase tracking-wide text-amber-300"
      title={title}
    >
      {label}
    </span>
  );
}

export function ExtensionsPanel({
  activeSlug,
  onSelect,
  onStartChatWithSubmission,
}: Props) {
  const extensions = useExtensions();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [mcpStatus, setMcpStatus] = useState<Record<string, McpStatus>>({});

  const loadMcpStatus = async () => {
    try {
      const list = await window.api.extensions.mcpStatus();
      setMcpStatus(Object.fromEntries(list.map((s) => [s.slug, s as McpStatus])));
    } catch {
      /* diagnostics are best-effort; never block the panel */
    }
  };

  useEffect(() => {
    void reloadExtensions();
    void loadMcpStatus();
    // Runtime connection outcomes arrive after a session connects its servers.
    const off = window.api.extensions.onMcpStatus(() => void loadMcpStatus());
    return off;
  }, []);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    try {
      await reloadExtensions();
      await loadMcpStatus();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3 text-[15px] font-semibold text-fg">
        <Plug className="h-4 w-4 text-fg-muted" strokeWidth={1.75} />
        <span>Extensions</span>
        {extensions && (
          <span className="text-xs tabular-nums text-fg-subtle">
            {extensions.length}
          </span>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={handleManualRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-1 rounded-md p-1 text-fg-subtle hover:bg-elevated hover:text-fg disabled:opacity-50"
          title="Refresh extension list"
          aria-label="Refresh"
        >
          <RefreshCw
            className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')}
            strokeWidth={1.75}
          />
        </button>
        <Button
          variant="outline"
          size="sm"
          icon={Plus}
          onClick={() => setDialogOpen(true)}
          title="Add a new extension by chatting with the agent"
          className="border-accent/40 bg-accent/10 text-accent hover:bg-accent/20 hover:text-accent"
        >
          New
        </Button>
      </header>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-2">
        {extensions === null ? (
          <div className="px-2 py-3 text-sm text-fg-subtle">Loading…</div>
        ) : extensions.length === 0 ? (
          <EmptyState onAdd={() => setDialogOpen(true)} />
        ) : (
          extensions.map((ext) => (
            <ExtensionRow
              key={ext.slug}
              ext={ext}
              active={ext.slug === activeSlug}
              mcpStatus={ext.variant === 'mcp-backed' ? mcpStatus[ext.slug] : undefined}
              onClick={() => onSelect(ext.slug)}
              onAfterDelete={() => {
                if (ext.slug === activeSlug) onSelect(null);
              }}
            />
          ))
        )}
      </div>

      <AddExtensionDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSubmit={(submit) => onStartChatWithSubmission?.(submit)}
      />
    </div>
  );
}

function ExtensionRow({
  ext,
  active,
  mcpStatus,
  onClick,
  onAfterDelete,
}: {
  ext: LoadedExtension;
  active: boolean;
  mcpStatus: McpStatus | undefined;
  onClick: () => void;
  onAfterDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const enabled = isEnabled(ext);
  return (
    <div className="group/ext relative border-b border-border last:border-b-0">
      {active && (
        <span className="absolute inset-y-2 left-0 z-10 w-0.5 rounded-r-sm bg-accent" />
      )}
      <button
        onClick={onClick}
        className={cn(
          'flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors',
          active ? 'bg-elevated' : 'hover:bg-elevated/60',
          !enabled && 'opacity-60',
        )}
      >
        <ExtensionAvatar extension={ext} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="truncate text-[0.95rem] font-medium text-fg">
              {displayName(ext)}
            </div>
            <span className="rounded bg-elevated/80 px-1.5 py-px font-mono text-[10px] uppercase tracking-wide text-fg-subtle">
              {VARIANT_LABEL[ext.variant]}
            </span>
            {!enabled && (
              <span className="rounded bg-amber-500/15 px-1.5 py-px text-[10px] uppercase tracking-wide text-amber-300">
                off
              </span>
            )}
            {enabled && <McpStatusBadge status={mcpStatus} />}
          </div>
          <div className="mt-0.5 truncate text-xs text-fg-subtle">
            {displayDescription(ext)}
          </div>
        </div>
      </button>

      <div
        className={cn(
          'absolute right-2 top-2 transition-opacity',
          'opacity-0 group-hover/ext:opacity-100',
          menuOpen && 'opacity-100',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <ExtensionMenu
          extension={ext}
          onAfterDelete={onAfterDelete}
          onOpenChange={setMenuOpen}
        />
      </div>
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      <Plug className="h-6 w-6 text-fg-subtle" strokeWidth={1.5} />
      <div className="text-sm font-medium text-fg">No extensions yet</div>
      <p className="max-w-[260px] text-xs text-fg-subtle">
        Extensions add capabilities — a CLI you want the agent to use, an MCP
        server, or just a usage guide. Describe what you want, and the agent
        will set it up for you.
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:bg-accent-hover"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2.5} /> New Extension
      </button>
    </div>
  );
}
