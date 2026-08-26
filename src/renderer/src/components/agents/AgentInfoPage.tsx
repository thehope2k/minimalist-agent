import { Bot } from 'lucide-react';
import { AgentHeader } from './agent-info-page/AgentHeader';
import { PageHeader } from './agent-info-page/PageHeader';
import { MetadataSection } from './agent-info-page/MetadataSection';
import { ToolsAndLimitsSection } from './agent-info-page/ToolsAndLimitsSection';
import { SystemPromptSection } from './agent-info-page/SystemPromptSection';
import { useAgentActions } from './agent-info-page/useAgentActions';
import { EditAgentDialog } from './EditAgentDialog';
import type { AgentInfoPageProps } from './agent-info-page/types';

export function AgentInfoPage({
  agent,
  onClose,
  onStartChatWithSubmission,
}: AgentInfoPageProps) {
  if (!agent) return <EmptyView />;

  const { copied, editMode, copySlug, handleEdit, closeEditDialog } =
    useAgentActions(agent, onStartChatWithSubmission);

  return (
    <div className="flex h-full flex-col">
      <AgentHeader
        agent={agent}
        copied={copied}
        onCopySlug={copySlug}
        onAfterDelete={onClose}
      />

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1100px] space-y-6 px-6 py-6">
          <PageHeader agent={agent} />

          <MetadataSection
            agent={agent}
            onEdit={() => handleEdit('metadata')}
            disabled={!onStartChatWithSubmission}
          />

          <ToolsAndLimitsSection agent={agent} />

          <SystemPromptSection
            agent={agent}
            onEdit={() => handleEdit('instructions')}
            disabled={!onStartChatWithSubmission}
          />
        </div>
      </div>

      {editMode && (
        <EditAgentDialog
          open
          mode={editMode}
          agent={agent}
          onClose={closeEditDialog}
          onSubmit={(submit) => onStartChatWithSubmission?.(submit)}
        />
      )}
    </div>
  );
}

function EmptyView() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-fg-subtle">
      <Bot className="h-6 w-6" strokeWidth={1.5} />
      <p className="text-sm">Select an agent to view its details</p>
    </div>
  );
}
