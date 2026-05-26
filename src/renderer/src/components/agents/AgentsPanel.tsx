// Top-level agents panel. Lists all available agents with their metadata.
// Mirrors SkillsPanel structure: left list + right detail view.
import { useEffect, useState } from 'react';
import { Plus, RefreshCw, Bot } from 'lucide-react';
import { useAgents } from '@/hooks/useAgents';
import { reload as reloadAgents } from '@/lib/agents';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui';
import { AgentRow } from './AgentRow';
import { AddAgentDialog } from './AddAgentDialog';
import type { SeedSubmit } from '@/App';

type Props = {
  /** Currently-selected slug (drives info-page rendering on the right). */
  activeSlug: string | null;
  onSelect: (slug: string | null) => void;
  /** Opens a fresh chat with a structured submission (used by "+ New Agent"). */
  onStartChatWithSubmission?: (submit: SeedSubmit) => void;
};

export function AgentsPanel({
  activeSlug,
  onSelect,
  onStartChatWithSubmission,
}: Props) {
  const agents = useAgents();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Bust the cache when the panel mounts so freshly-written AGENT.md
  // files show up immediately.
  useEffect(() => {
    void reloadAgents();
  }, []);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    try {
      await reloadAgents();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3 text-[15px] font-semibold text-fg">
        <Bot className="h-4 w-4 text-fg-muted" strokeWidth={1.75} />
        <span>Agents</span>
        {agents && (
          <span className="text-xs tabular-nums text-fg-subtle">
            {agents.length}
          </span>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={handleManualRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-1 rounded-md p-1 text-fg-subtle hover:bg-elevated hover:text-fg disabled:opacity-50"
          title="Refresh agent list"
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
          title="Build a new agent by chatting with the model"
          className="border-accent/40 bg-accent/10 text-accent hover:bg-accent/20 hover:text-accent"
        >
          New
        </Button>
      </header>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-2">
        {agents === null ? (
          <div className="px-2 py-3 text-sm text-fg-subtle">Loading…</div>
        ) : agents.length === 0 ? (
          <EmptyState onAdd={() => setDialogOpen(true)} />
        ) : (
          agents.map((agent) => (
            <AgentRow
              key={agent.slug}
              agent={agent}
              active={agent.slug === activeSlug}
              onClick={() => onSelect(agent.slug)}
              onAfterDelete={() => {
                if (agent.slug === activeSlug) onSelect(null);
              }}
            />
          ))
        )}
      </div>

      <AddAgentDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSubmit={(submit) => onStartChatWithSubmission?.(submit)}
      />
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      <Bot className="h-6 w-6 text-fg-subtle" strokeWidth={1.5} />
      <div className="text-sm font-medium text-fg">No agents yet</div>
      <p className="max-w-65 text-xs text-fg-subtle">
        Agents are specialized sub-agents the model can delegate work to.
        Build one with AI or add an <code>AGENT.md</code> under
        <code> ~/.agents/agents/</code>.
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:bg-accent-hover"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2.5} /> New Agent
      </button>
    </div>
  );
}
