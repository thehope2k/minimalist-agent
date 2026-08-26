import { Markdown } from '../../chat/parts/markdown/Markdown';
import type { LoadedAgent } from '@/lib/electron';
import { EditButton } from './shared';

interface SystemPromptSectionProps {
  agent: LoadedAgent;
  onEdit: () => void;
  disabled?: boolean;
}

export function SystemPromptSection({ agent, onEdit, disabled }: SystemPromptSectionProps) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-fg">System Prompt</h2>
        <EditButton onClick={onEdit} disabled={disabled} />
      </div>
      <div className="overflow-hidden rounded-lg border border-border/50 bg-elevated/20">
        <div className="markdown px-4 py-4">
          <Markdown text={agent.content} />
        </div>
      </div>
    </section>
  );
}
