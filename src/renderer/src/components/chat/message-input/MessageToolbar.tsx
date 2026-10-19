import { PermissionModeButton } from '../PermissionModeButton';
import { ThinkingLevelButton } from '../ThinkingLevelButton';
import { SessionInfoButton } from '../SessionInfoButton';
import { ContextBadge } from '../ContextBadge';
import { IconButton } from '@/components/ui';
import { ChevronDown, FoldVertical } from 'lucide-react';
import { snapshot, resolveCompactionSettings } from '@/lib/connections';
import type { PermissionMode, ThinkingLevel, ConnectionMeta } from '@/lib/electron';
import type { ChatMessage } from '@/lib/chat';

/** Fallback when the active model's contextWindow can't be resolved (e.g.
 *  connection metadata not yet loaded). */
const DEFAULT_CONTEXT_WINDOW = 200_000;

type Props = {
  permissionMode: PermissionMode;
  onChangePermissionMode: (mode: PermissionMode) => void;
  autonomyLevel: number;
  onChangeAutonomyLevel: (level: number) => void;
  thinkingLevel: ThinkingLevel;
  onChangeThinkingLevel: (level: ThinkingLevel) => void;
  isStreaming: boolean;
  sessionId: string | null;
  title: string;
  messages: ChatMessage[];
  connection: ConnectionMeta | null;
  model: string | null;
  onManualCompact?: (
    connectionSlug: string,
    customInstructions?: string,
  ) => Promise<{ ok: boolean; reason?: string }>;
  onMinimize?: () => void;
};

export function MessageToolbar({
  permissionMode,
  onChangePermissionMode,
  autonomyLevel,
  onChangeAutonomyLevel,
  thinkingLevel,
  onChangeThinkingLevel,
  isStreaming,
  sessionId,
  title,
  messages,
  connection,
  model,
  onManualCompact,
  onMinimize,
}: Props) {
  const supportsReasoning =
    !!connection &&
    !!model &&
    (connection.models.find((m) => m.id === model)?.supportsReasoning ?? false);

  const canManualCompact = !!onManualCompact && !!connection && messages.length > 0;

  const activeModelDef = connection?.models.find((m) => m.id === model);
  const contextWindow = activeModelDef?.contextWindow ?? DEFAULT_CONTEXT_WINDOW;

  return (
    // Container queries let the pills shed labels as the chat column narrows
    // (side panel open) instead of clipping off the right edge.
    <div className="@container mb-2 px-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <PermissionModeButton
          mode={permissionMode}
          onModeChange={onChangePermissionMode}
          autonomyLevel={autonomyLevel}
          onAutonomyChange={onChangeAutonomyLevel}
          disabled={isStreaming}
        />
        {supportsReasoning && (
          <ThinkingLevelButton
            level={thinkingLevel}
            onLevelChange={onChangeThinkingLevel}
            disabled={isStreaming}
          />
        )}
        <div className="flex-1" />
        {canManualCompact && (
          <IconButton
            icon={FoldVertical}
            label="Compact now"
            disabled={isStreaming}
            onClick={() => void onManualCompact!(connection!.slug)}
          />
        )}
        {model && connection && (
          <ContextBadge
            messages={messages}
            contextWindow={contextWindow}
            reserveTokens={
              resolveCompactionSettings(snapshot().settings.compactionSettings, {
                contextWindow,
                maxTokens: activeModelDef?.maxOutputTokens,
              }).reserveTokens
            }
          />
        )}
        <SessionInfoButton sessionId={sessionId} title={title} />
        {onMinimize && (
          // Disabled while streaming so abort/steer stay reachable.
          <IconButton
            icon={ChevronDown}
            label="Minimize composer"
            title="Minimize composer"
            disabled={isStreaming}
            onClick={onMinimize}
          />
        )}
      </div>
    </div>
  );
}
