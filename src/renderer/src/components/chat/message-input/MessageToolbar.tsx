import { PermissionModeButton } from '../PermissionModeButton';
import { SessionInfoButton } from '../SessionInfoButton';
import { ContextBadge } from '../ContextBadge';
import type { PermissionMode, ConnectionMeta } from '@/lib/electron';
import type { ChatMessage } from '@/lib/chat';

type Props = {
  permissionMode: PermissionMode;
  onChangePermissionMode: (mode: PermissionMode) => void;
  autonomyLevel: number;
  onChangeAutonomyLevel: (level: number) => void;
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
  isStreaming,
  sessionId,
  title,
  messages,
  connection,
  model,
}: Props) {
  return (
    <div className="mb-2 flex items-center gap-2 px-1">
      <PermissionModeButton
        mode={permissionMode}
        onModeChange={onChangePermissionMode}
        autonomyLevel={autonomyLevel}
        onAutonomyChange={onChangeAutonomyLevel}
        disabled={isStreaming}
      />
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
