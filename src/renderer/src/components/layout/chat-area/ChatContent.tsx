import { useRef, useState } from 'react';
import { ChatScroll, type ChatScrollHandle } from '@/components/chat/ChatScroll';
import { FindBar } from '@/components/chat/FindBar';
import { useFindInChat } from '@/hooks/useFindInChat';
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
  findOpen: boolean;
  onFindClose: () => void;
  findInputRef: React.RefObject<HTMLInputElement | null>;
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
  findOpen,
  onFindClose,
  findInputRef,
}: Props) {
  // Ref forwarded to ChatScroll so that useFindInChat can scope mark.js to
  // the message list DOM node rather than the whole chat panel.
  const chatScrollRef = useRef<ChatScrollHandle>(null);

  // findInputRef is owned by the parent (ChatArea / useKeyboardShortcuts) so the
  // Cmd+F shortcut handler can call focus()+select() on the input from outside
  // this component. We do not create our own ref here.

  // Local query state lives here (not in the parent) because only ChatContent
  // and its children care about it; the parent only controls open/close.
  const [findQuery, setFindQuery] = useState('');

  // Derive the container ref from the imperative handle. mark.js needs the raw
  // HTMLElement, not the handle itself.
  const scrollContainerRef = {
    get current() {
      return chatScrollRef.current?.scrollContainer ?? null;
    },
  } as React.RefObject<HTMLElement | null>;

  const { matchCount, activeIndex, next, prev, clear } = useFindInChat(
    scrollContainerRef,
    findQuery,
    findOpen,
  );

  const handleFindClose = () => {
    clear();
    setFindQuery('');
    onFindClose();
  };
  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Find bar slides in between the header and the message list. The bar
          is always rendered (not conditionally mounted) so that the slide-out
          animation plays correctly — if we unmounted on close the bar would
          disappear instantly instead of sliding up. */}
      <FindBar
        open={findOpen}
        query={findQuery}
        onQueryChange={setFindQuery}
        matchCount={matchCount}
        activeIndex={activeIndex}
        onNext={next}
        onPrev={prev}
        onClose={handleFindClose}
        inputRef={findInputRef}
      />
      <ChatScroll ref={chatScrollRef} sessionId={activeSessionId ?? sessionId} contentSignal={contentSignal}>
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
