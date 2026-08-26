import type { LoadedAgent } from '@/lib/electron';
import { AgentAvatar } from '../AgentAvatar';

export function PageHeader({ agent }: { agent: LoadedAgent }) {
  return (
    <div className="flex items-start gap-3">
      <AgentAvatar agent={agent} size="lg" />
      <div className="min-w-0 flex-1">
        <h1 className="text-xl font-semibold text-fg">{agent.metadata.name}</h1>
        <p className="mt-0.5 text-sm text-fg-muted">
          {agent.metadata.description}
        </p>
      </div>
    </div>
  );
}
