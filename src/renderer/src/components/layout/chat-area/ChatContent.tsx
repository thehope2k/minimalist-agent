import { ChatScroll } from '@/components/chat/ChatScroll';
import { MessageList } from '@/components/chat/MessageList';
import { MessageInput } from '@/components/chat/MessageInput';
import { EmptyState } from '@/components/chat/EmptyState';
import { CollaborationPrompt } from '@/components/chat/CollaborationPrompt';
import type { ChatMessage } from '@/lib/chat';
import type { Plan } from '@/lib/electron';
import type { CompactionNotice } from '@/hooks/useChat';
import type { PermissionMode } from '@/lib/electron';

type Props = {
  sessionId: string | null;
  activeSessionId: string | null;
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingTurnId: string | null;
  contentSignal: number;
  cwd: string | undefined;
  setCwd: (cwd: string | undefined) => void;
  permissionMode: PermissionMode;
  setPermissionMode: (mode: PermissionMode) => void;
  autonomyLevel: number;
  setAutonomyLevel: (level: number) => void;
  title: string;
  lastCompaction: CompactionNotice | null;
  projectDefaultConnectionSlug: string;
  sessionConnectionSlug: string;
  sessionModel: string;
  loadedSessionPickId: string | null;
  pendingMessage: string | undefined;
  onPendingMessageConsumed: () => void;
  onSend: (args: any) => void;
  onAbort: () => void;
  onSteer: any;
  onRetry: () => void;
  onContinue: () => void;
  onBranch: (id: string) => void;
  getPlanForMessage: (sessionId: string | null | undefined, messageId: string) => Plan | null;
};

export function ChatContent({
  sessionId,
  activeSessionId,
  messages,
  isStreaming,
  streamingTurnId,
  contentSignal,
  cwd,
  setCwd,
  permissionMode,
  setPermissionMode,
  autonomyLevel,
  setAutonomyLevel,
  title,
  lastCompaction,
  projectDefaultConnectionSlug,
  sessionConnectionSlug,
  sessionModel,
  loadedSessionPickId,
  pendingMessage,
  onPendingMessageConsumed,
  onSend,
  onAbort,
  onSteer,
  onRetry,
  onContinue,
  onBranch,
  getPlanForMessage,
}: Props) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ChatScroll sessionId={activeSessionId ?? sessionId} contentSignal={contentSignal}>
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="pl-4 pr-12">
            <MessageList
              messages={messages}
              onRetry={onRetry}
              isStreaming={isStreaming}
              onContinue={isStreaming ? undefined : onContinue}
              onBranch={isStreaming ? undefined : onBranch}
              sessionId={(activeSessionId ?? sessionId) as string | undefined}
              getPlanForMessage={getPlanForMessage}
            />
          </div>
        )}
      </ChatScroll>

      <div className="shrink-0 pb-4 pt-2 relative">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-6 left-0 right-0 h-6 bg-linear-to-b from-transparent to-canvas"
        />
        <div className="pl-4 pr-12">
          <MessageInput
            isStreaming={isStreaming}
            streamingTurnId={streamingTurnId}
            cwd={cwd}
            onChangeCwd={setCwd}
            cwdLocked={messages.length > 0}
            permissionMode={permissionMode}
            onChangePermissionMode={setPermissionMode}
            autonomyLevel={autonomyLevel}
            onChangeAutonomyLevel={setAutonomyLevel}
            onSend={onSend}
            onAbort={onAbort}
            onSteer={onSteer}
            sessionId={activeSessionId ?? sessionId}
            title={title}
            messages={messages}
            lastCompaction={lastCompaction}
            projectDefaultConnectionSlug={projectDefaultConnectionSlug || undefined}
            sessionConnectionSlug={sessionConnectionSlug || undefined}
            sessionModel={sessionModel || undefined}
            loadedSessionPickId={loadedSessionPickId}
            pendingMessage={pendingMessage}
            onPendingMessageConsumed={onPendingMessageConsumed}
          />
        </div>
      </div>

      <CollaborationPrompt />
    </div>
  );
}
