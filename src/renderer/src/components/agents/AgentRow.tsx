import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui';
import { AgentAvatar } from './AgentAvatar';
import { AgentMenu } from './AgentMenu';
import type { LoadedAgent } from '@/lib/electron';

type Props = {
  agent: LoadedAgent;
  active: boolean;
  onClick: () => void;
  onAfterDelete: () => void;
};

export function AgentRow({ agent, active, onClick, onAfterDelete }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="group/agent relative border-b border-border last:border-b-0">
      {active && (
        <span className="absolute inset-y-2 left-0 z-10 w-0.5 rounded-r-sm bg-accent" />
      )}
      <button
        onClick={onClick}
        className={cn(
          'flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors',
          active ? 'bg-elevated' : 'hover:bg-elevated/60',
        )}
      >
        <AgentAvatar agent={agent} size="md" />

        <div className="min-w-0 flex-1">
          <div className="truncate text-[0.95rem] font-medium text-fg">
            {agent.metadata.name}
          </div>
          <div className="mt-0.5 truncate text-xs text-fg-subtle">
            {agent.metadata.description}
          </div>
          {/* Metadata badges */}
          <div className="mt-1.5 flex gap-1 flex-wrap">
            {agent.metadata.model && (
              <Badge className="text-[0.7rem] px-1.5 py-0.5 text-fg-subtle border-border">
                {agent.metadata.model}
              </Badge>
            )}
            {agent.metadata.tools && agent.metadata.tools.length > 0 && (
              <Badge className="text-[0.7rem] px-1.5 py-0.5 text-fg-subtle border-border">
                {agent.metadata.tools.length} tools
              </Badge>
            )}
          </div>
        </div>
      </button>

      <div
        className={cn(
          'absolute right-2 top-2 transition-opacity',
          'opacity-0 group-hover/agent:opacity-100',
          menuOpen && 'opacity-100',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <AgentMenu
          agent={agent}
          onAfterDelete={onAfterDelete}
          onOpenChange={setMenuOpen}
        />
      </div>
    </div>
  );
}
