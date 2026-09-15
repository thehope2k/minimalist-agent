import { cn } from '@/lib/utils';
import type { ChatMessage } from '@/lib/chat';
import type { Plan } from '@/lib/electron';
import { ErrorBubble } from '../ErrorBubble';
import { MessageAttachments } from '../MessageAttachments';
import { labelForIntent } from './utils';
import { AssistantMessage } from './bubble/AssistantMessage';
import { AssistantMessageFooter } from './bubble/AssistantMessageFooter';
import { UserMessage } from './bubble/UserMessage';

export function Bubble({
  message,
  onRetry,
  isRetrying,
  onContinue,
  onBranch,
  sessionId,
  plan,
}: {
  message: ChatMessage;
  onRetry?: () => void;
  isRetrying?: boolean;
  onContinue?: () => void;
  onBranch?: (withContext?: boolean) => void;
  sessionId?: string;
  plan?: Plan | null;
}) {
  const isUser = message.role === 'user';
  const intentLabel = isUser ? labelForIntent(message.intentTag) : null;

  return (
    <div className={cn('group flex flex-col', isUser ? 'items-end' : 'items-start')}>
      {intentLabel && (
        <span className="mb-1 inline-flex items-center gap-1 rounded-md border border-border/40 bg-elevated/50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
          {intentLabel}
        </span>
      )}
      {isUser && message.attachments && message.attachments.length > 0 && (
        <MessageAttachments attachments={message.attachments} className="mb-1.5" />
      )}

      {isUser ? (
        <UserMessage
          parts={message.parts}
          attachments={message.attachments ?? []}
          intentTag={message.intentTag}
          onBranch={onBranch}
        />
      ) : (
        <AssistantMessage message={message} sessionId={sessionId} plan={plan} />
      )}

      {(message.errorInfo || message.error) && (
        <ErrorBubble
          error={message.errorInfo}
          legacyText={!message.errorInfo ? message.error : undefined}
          onRetry={onRetry}
          isRetrying={isRetrying}
        />
      )}

      {!isUser && (
        <AssistantMessageFooter message={message} onContinue={onContinue} sessionId={sessionId} />
      )}
    </div>
  );
}
