import type { ChatMessage } from '@/lib/chat';
import type { Plan } from '@/lib/electron';
import { Bubble } from './message-list/Bubble';
import { CompactionDivider } from './message-list/CompactionDivider';

export function MessageList({
  messages,
  onRetry,
  isStreaming,
  onContinue,
  onBranch,
  sessionId,
  getPlanForMessage,
}: {
  messages: ChatMessage[];
  onRetry?: () => void;
  isStreaming?: boolean;
  onContinue?: () => void;
  onBranch?: (messageId: string) => void;
  sessionId?: string;
  getPlanForMessage?: (sessionId: string | null | undefined, messageId: string) => Plan | null;
}) {
  const retriableId = findLastRetriableId(messages);

  return (
    <div className="mx-auto w-full max-w-240 space-y-6 py-8">
      {messages.map((m) =>
        m.markerKind === 'compaction' ? (
          <CompactionDivider key={m.id} message={m} />
        ) : (
          <Bubble
            key={m.id}
            message={m}
            onRetry={m.id === retriableId ? onRetry : undefined}
            isRetrying={m.id === retriableId && !!isStreaming}
            onContinue={onContinue}
            onBranch={m.role === 'user' && !m.isStreaming && onBranch
              ? () => onBranch(m.id)
              : undefined
            }
            sessionId={sessionId}
            plan={getPlanForMessage?.(sessionId, m.id) ?? null}
          />
        ),
      )}
    </div>
  );
}

function findLastRetriableId(messages: ChatMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== 'assistant') continue;
    if (m.errorInfo?.canRetry) return m.id;
    if (!m.errorInfo && !m.error) return null;
    return null;
  }
  return null;
}
