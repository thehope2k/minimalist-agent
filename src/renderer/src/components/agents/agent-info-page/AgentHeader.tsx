import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AgentAvatar } from '../AgentAvatar';
import { AgentMenu } from '../AgentMenu';
import type { LoadedAgent } from '@/lib/electron';

interface AgentHeaderProps {
  agent: LoadedAgent;
  copied: boolean;
  onCopySlug: () => void;
  onAfterDelete?: () => void;
}

export function AgentHeader({
  agent,
  copied,
  onCopySlug,
  onAfterDelete,
}: AgentHeaderProps) {
  return (
    <header className="flex h-10 shrink-0 items-center gap-3 border-b border-border px-4">
      <AgentAvatar agent={agent} size="sm" />
      <span className="truncate text-sm font-medium text-fg">
        {agent.metadata.name}
      </span>
      <div className="flex-1" />
      <button
        type="button"
        onClick={onCopySlug}
        title="Copy slug to clipboard"
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-panel/40 px-2 py-1 font-mono text-[11px]',
          copied ? 'text-emerald-300' : 'text-fg-muted hover:bg-elevated hover:text-fg',
        )}
      >
        {copied ? (
          <Check className="h-3 w-3" strokeWidth={2} />
        ) : (
          <Copy className="h-3 w-3" strokeWidth={2} />
        )}{' '}
        {agent.slug}
      </button>
      <AgentMenu agent={agent} variant="header" onAfterDelete={onAfterDelete} />
    </header>
  );
}
