import { useState } from 'react';
import { Check, ChevronsRight, Copy, GitBranch } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '../../ui';
import { readAttachmentBase64 } from '@/lib/attachments';
import type { ChatMessage, MessagePart } from '@/lib/chat';
import type { Plan, StoredAttachment } from '@/lib/electron';
import { AssistantCard } from '../AssistantCard';
import { ErrorBubble } from '../ErrorBubble';
import { MentionText } from '../MentionText';
import { MessageAttachments } from '../MessageAttachments';
import { StreamStatus } from '../StreamStatus';
import { PlanProgress } from '../PlanProgress';
import { TextPart } from '../parts/TextPart';
import { ThinkingPart } from '../parts/ThinkingPart';
import { ToolPart } from '../parts/ToolPart';
import { TurnSummaryCard } from '../parts/TurnSummaryCard';
import { compactNumber, emptyTurnLabel, labelForIntent, partKey } from './utils';

export function Bubble({
  message: m,
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
  onBranch?: () => void;
  sessionId?: string;
  plan?: Plan | null;
}) {
  const isUser = m.role === 'user';
  const parts = m.parts;
  const showStopBadge =
    !m.isStreaming && m.stopReason && m.stopReason !== 'end_turn' && !isUser;
  const intentLabel = isUser ? labelForIntent(m.intentTag) : null;

  return (
    <div className={cn('group flex flex-col', isUser ? 'items-end' : 'items-start')}>
      {intentLabel && (
        <span className="mb-1 inline-flex items-center gap-1 rounded-md border border-border/40 bg-elevated/50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
          {intentLabel}
        </span>
      )}
      {isUser && m.attachments && m.attachments.length > 0 && (
        <MessageAttachments attachments={m.attachments} className="mb-1.5" />
      )}
      {isUser ? (
        <>
          <div
            className={cn(
              'max-w-[80%]',
              parts.length === 0 && 'hidden',
              parts.length > 0 &&
                (m.intentTag === 'steer'
                  ? 'rounded-2xl border border-dashed border-accent/40 bg-accent/5 px-3.5 py-2 text-sm leading-relaxed text-fg whitespace-pre-wrap wrap-break-word'
                  : 'rounded-2xl bg-elevated px-4 py-2.5 text-sm leading-relaxed text-fg whitespace-pre-wrap wrap-break-word'),
            )}
          >
            <MentionText text={parts.map((p) => (p.kind === 'text' ? p.text : '')).join('')} />
          </div>
          <UserMessageActions
            text={parts.map((p) => (p.kind === 'text' ? p.text : '')).join('')}
            attachments={m.attachments ?? []}
            onBranch={onBranch}
          />
        </>
      ) : (
        (parts.length > 0 || m.isStreaming) ? (
          <AssistantCard>
            {parts.map((p, i) => (
              <PartView key={partKey(p.kind, p.kind === 'tool' ? p.toolUseId : undefined, i)} part={p} />
            ))}
            {!m.isStreaming && <TurnSummaryCard parts={m.parts} />}
            {m.isStreaming && <StreamStatus parts={parts} startedAt={m.createdAt} />}
            {/* Plan Progress - pinned to the assistant message that created the plan */}
            {plan && sessionId && (
              <div className="mt-3 border-t border-border/30 pt-3">
                <PlanProgress sessionId={sessionId} plan={plan} />
              </div>
            )}
          </AssistantCard>
        ) : (
          !m.errorInfo && !m.error && m.stopReason && m.stopReason !== 'end_turn' && (
            <AssistantCard>
              <p className="text-sm text-fg-muted italic">{emptyTurnLabel(m.stopReason)}</p>
            </AssistantCard>
          )
        )
      )}

      {(m.errorInfo || m.error) && (
        <ErrorBubble
          error={m.errorInfo}
          legacyText={!m.errorInfo ? m.error : undefined}
          onRetry={onRetry}
          isRetrying={isRetrying}
        />
      )}

      {!isUser && !m.isStreaming && (
        <div className="mt-1 flex items-center gap-1.5">
          {showStopBadge && (
            <span className="rounded-sm bg-amber-500/15 px-1 py-px text-[10px] font-medium text-amber-300">
              {m.stopReason}
            </span>
          )}
          {(m.stopReason === 'max_turns' || m.errorInfo?.code === 'max_turns_exceeded') &&
            onContinue && (
              <Button
                variant="outline" size="sm" icon={ChevronsRight} onClick={onContinue}
                className="h-5 border-accent/40 bg-accent/10 px-1.5 text-[10px] text-accent hover:bg-accent/20 hover:text-accent"
              >
                Continue
              </Button>
            )}
          {(m.model || m.usage?.outputTokens !== undefined || m.stopReason || m.durationMs !== undefined) && (
            <span className={cn(
              'inline-flex items-center gap-1.5 rounded-md border border-border/40 bg-panel/40',
              'px-1.5 py-0.5 font-mono text-[10px] text-fg-subtle',
              'opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100',
            )}>
              {m.model && <span className="text-fg-muted">{m.model}</span>}
              {m.model && m.usage?.outputTokens !== undefined && <span className="opacity-50">·</span>}
              {m.usage?.outputTokens !== undefined && (
                <span title="input ↑ / output ↓ tokens">
                  {compactNumber(m.usage.inputTokens ?? 0)}↑ {compactNumber(m.usage.outputTokens)}↓
                </span>
              )}
              {m.stopReason && !showStopBadge && (
                <><span className="opacity-50">·</span><span title="SDK stop_reason">{m.stopReason}</span></>
              )}
              {m.durationMs !== undefined && (
                <><span className="opacity-50">·</span><span title="Turn duration">{formatDuration(m.durationMs)}</span></>
              )}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function PartView({ part }: { part: MessagePart }) {
  switch (part.kind) {
    case 'text':     return <TextPart text={part.text} />;
    case 'thinking': return <ThinkingPart text={part.text} />;
    case 'tool':
      return (
        <ToolPart
          name={part.name}
          input={part.input}
          partialInputJson={part.partialInputJson}
          result={part.result}
          status={part.status}
          subagent={part.subagent}
        />
      );
    default: return null;
  }
}

function UserMessageActions({ text, attachments, onBranch }: {
  text: string;
  attachments: StoredAttachment[];
  onBranch?: () => void;
}) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [branchState, setBranchState] = useState<'idle' | 'branching'>('idle');

  const handleCopy = async () => {
    try {
      await copyMessage(text, attachments);
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 1500);
    } catch (e) {
      console.error('Copy failed:', e);
      setCopyState('error');
      window.setTimeout(() => setCopyState('idle'), 1500);
    }
  };

  const handleBranch = async () => {
    if (!onBranch || branchState === 'branching') return;
    setBranchState('branching');
    try {
      await onBranch();
    } finally {
      setBranchState('idle');
    }
  };

  if (!text.trim() && attachments.length === 0) return null;

  return (
    <div className="mt-1 flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => void handleCopy()}
        className={cn(
          'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-fg-subtle',
          'transition-opacity duration-150 hover:bg-elevated hover:text-fg',
          'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
        )}
        title={copyState === 'error' ? 'Copy failed' : 'Copy message'}
      >
        {copyState === 'copied' ? (
          <><Check className="h-3 w-3" strokeWidth={2} /><span>Copied</span></>
        ) : (
          <><Copy className="h-3 w-3" strokeWidth={1.75} /><span>{copyState === 'error' ? 'Failed' : 'Copy'}</span></>
        )}
      </button>
      {onBranch && (
        <button
          type="button"
          onClick={() => void handleBranch()}
          disabled={branchState === 'branching'}
          className={cn(
            'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-fg-subtle',
            'transition-opacity duration-150 hover:bg-elevated hover:text-fg',
            'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
            branchState === 'branching' && 'opacity-60 cursor-wait',
          )}
          title="Branch conversation from here"
        >
          <GitBranch className="h-3 w-3" strokeWidth={1.75} />
          <span>{branchState === 'branching' ? 'Branching…' : 'Branch'}</span>
        </button>
      )}
    </div>
  );
}

async function copyMessage(text: string, attachments: StoredAttachment[]): Promise<void> {
  const images = attachments.filter((a) => a.type === 'image');
  const others = attachments.filter((a) => a.type !== 'image');
  const trailers = others.length ? '\n\n' + others.map((a) => `[file: ${a.name}]`).join('\n') : '';
  const fullText = (text + trailers).trim();

  if (images.length === 0) { await navigator.clipboard.writeText(fullText); return; }

  const items: ClipboardItem[] = [];
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const b64 = await readAttachmentBase64(img.storedPath);
    if (!b64) continue;
    const blob = base64ToBlob(b64, img.mimeType || 'image/png');
    const types: Record<string, Blob> = { [blob.type]: blob };
    if (i === 0 && fullText) types['text/plain'] = new Blob([fullText], { type: 'text/plain' });
    items.push(new ClipboardItem(types));
  }

  if (items.length === 0) { await navigator.clipboard.writeText(fullText); return; }
  try { await navigator.clipboard.write(items); }
  catch { await navigator.clipboard.writeText(fullText); }
}

function base64ToBlob(b64: string, mimeType: string): Blob {
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mimeType });
}

function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${s}s`;
}
