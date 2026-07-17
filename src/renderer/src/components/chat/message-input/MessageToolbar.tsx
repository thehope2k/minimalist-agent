import { PermissionModeButton } from '../PermissionModeButton';
import { ThinkingLevelButton } from '../ThinkingLevelButton';
import { SessionInfoButton } from '../SessionInfoButton';
import { ContextBadge } from '../ContextBadge';
import type { PermissionMode, ThinkingLevel, ConnectionMeta } from '@/lib/electron';
import type { ChatMessage } from '@/lib/chat';

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
}: Props) {
  const supportsReasoning =
    !!connection && !!model &&
    (connection.models.find((m) => m.id === model)?.supportsReasoning ?? false);

  return (
    <div className="mb-2 flex items-center gap-2 px-1">
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
      {model && connection && (
        <ContextBadge
          messages={messages}
          contextWindow={
            connection.models.find((m) => m.id === model)?.contextWindow ??
            200_000
          }
        />
      )}
      <SessionInfoButton sessionId={sessionId} title={title} messages={messages} />
    </div>
  );
}
