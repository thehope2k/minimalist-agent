import { useState } from 'react';
import { Check, ChevronsRight, Copy, Scissors } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '../ui';
import { readAttachmentBase64 } from '@/lib/attachments';
import type { ChatMessage, MessagePart } from '@/lib/chat';
import type { StoredAttachment } from '@/lib/electron';
import { AssistantCard } from './AssistantCard';
import { ErrorBubble } from './ErrorBubble';
import { MentionText } from './MentionText';
import { MessageAttachments } from './MessageAttachments';
import { StreamStatus } from './StreamStatus';
import { TextPart } from './parts/TextPart';
import { ThinkingPart } from './parts/ThinkingPart';
import { ToolPart } from './parts/ToolPart';

export function MessageList({
  messages,
  onRetry,
  isStreaming,
  onContinue,
}: {
  messages: ChatMessage[];
  /** Called when the user clicks the Retry button on a failed bubble. */
  onRetry?: () => void;
  /** Disables the Retry button while another turn is in flight. */
  isStreaming?: boolean;
  /** Called when the user clicks "Continue" on a max_turns bubble. */
  onContinue?: () => void;
}) {
  // Only the *last* errored assistant message gets a Retry button —
  // retrying anything older would re-anchor the conversation in a way
  // that's confusing. Pre-compute its id once.
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
          />
        ),
      )}
    </div>
  );
}

function CompactionDivider({ message }: { message: ChatMessage }) {
  const meta = message.compactionMeta;
  const saved =
    meta && meta.preTokens > 0
      ? Math.max(0, meta.preTokens - (meta.postTokens ?? 0))
      : 0;
  const trigger = meta?.trigger ?? 'auto';
  // Three-part horizontal: dashed line · pill · dashed line. Reads as a
  // hard cut in the conversation so users can spot the boundary instantly.
  return (
    <div
      role="separator"
      aria-label="Conversation compacted"
      className="my-2 flex items-center gap-3 text-fg-subtle"
      title={
        meta
          ? `Trigger: ${trigger}\nBefore: ${meta.preTokens.toLocaleString()} tokens\nAfter: ${(meta.postTokens ?? 0).toLocaleString()} tokens`
          : undefined
      }
    >
      <div className="h-px flex-1 border-t border-dashed border-amber-500/30" />
      <div className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-amber-300">
        <Scissors className="h-3 w-3" strokeWidth={2} />
        <span>Compacted</span>
        {saved > 0 && (
          <span className="font-mono text-[10px] normal-case opacity-80">
            saved {compactNumber(saved)} tokens
          </span>
        )}
        {trigger === 'manual' && (
          <span className="rounded bg-amber-500/20 px-1 text-[9px] normal-case">
            manual
          </span>
        )}
      </div>
      <div className="h-px flex-1 border-t border-dashed border-amber-500/30" />
    </div>
  );
}

function findLastRetriableId(messages: ChatMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== 'assistant') continue;
    if (m.errorInfo?.canRetry) return m.id;
    // First non-error assistant from the bottom — nothing to retry above it.
    if (!m.errorInfo && !m.error) return null;
    return null;
  }
  return null;
}

function Bubble({
  message: m,
  onRetry,
  isRetrying,
  onContinue,
}: {
  message: ChatMessage;
  onRetry?: () => void;
  isRetrying?: boolean;
  onContinue?: () => void;
}) {
  const isUser = m.role === 'user';
  const parts = m.parts;
  const showStopBadge =
    !m.isStreaming && m.stopReason && m.stopReason !== 'end_turn' && !isUser;
  const intentLabel = isUser ? labelForIntent(m.intentTag) : null;

  return (
    <div
      className={cn(
        'group flex flex-col',
        isUser ? 'items-end' : 'items-start',
      )}
    >
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
                  ? // Steer bubble — dashed accent outline so the mid-turn
                    // injection reads as a side note rather than a normal
                    // turn. Slightly tighter padding for the same reason.
                    'rounded-2xl border border-dashed border-accent/40 bg-accent/5 px-3.5 py-2 text-sm leading-relaxed text-fg whitespace-pre-wrap wrap-break-word'
                  : 'rounded-2xl bg-elevated px-4 py-2.5 text-sm leading-relaxed text-fg whitespace-pre-wrap wrap-break-word'),
            )}
          >
            {/* User messages are always a single text part — render flat,
                with @-mentions promoted to inline chips. */}
            <MentionText
              text={parts.map((p) => (p.kind === 'text' ? p.text : '')).join('')}
            />
          </div>
          <UserMessageActions
            text={parts
              .map((p) => (p.kind === 'text' ? p.text : ''))
              .join('')}
            attachments={m.attachments ?? []}
          />
        </>
      ) : (
        (parts.length > 0 || m.isStreaming) ? (
          <AssistantCard>
            {parts.map((p, i) => (
              <PartView key={partKey(p, i)} part={p} />
            ))}
            {m.isStreaming && <StreamStatus parts={parts} startedAt={m.createdAt} />}
          </AssistantCard>
        ) : (
          !m.errorInfo &&
          !m.error &&
          m.stopReason &&
          m.stopReason !== 'end_turn' && (
            <AssistantCard>
              <p className="text-sm text-fg-muted italic">
                {emptyTurnLabel(m.stopReason)}
              </p>
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
          {/* Continue button shows in two equivalent states:
                a) `stopReason === 'max_turns'` — legacy SDK reported via
                   the success-result path; or
                b) `errorInfo.code === 'max_turns_exceeded'` — modern SDK
                   path where max-turns is surfaced as a typed error
                   (see errors.ts:RESULT_SUBTYPE_TO_CODE). */}
          {(m.stopReason === 'max_turns' ||
            m.errorInfo?.code === 'max_turns_exceeded') &&
            onContinue && (
              <Button
                variant="outline"
                size="sm"
                icon={ChevronsRight}
                onClick={onContinue}
                className="h-5 border-accent/40 bg-accent/10 px-1.5 text-[10px] text-accent hover:bg-accent/20 hover:text-accent"
              >
                Continue
              </Button>
            )}
          {(m.model || m.usage?.outputTokens !== undefined || m.stopReason) && (
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md border border-border/40 bg-panel/40',
                'px-1.5 py-0.5 font-mono text-[10px] text-fg-subtle',
                'opacity-0 transition-opacity duration-150 group-hover:opacity-100',
                'focus-within:opacity-100',
              )}
            >
              {m.model && <span className="text-fg-muted">{m.model}</span>}
              {m.model && m.usage?.outputTokens !== undefined && (
                <span className="opacity-50">·</span>
              )}
              {m.usage?.outputTokens !== undefined && (
                <span title="input ↑ / output ↓ tokens">
                  {compactNumber(m.usage.inputTokens ?? 0)}↑{' '}
                  {compactNumber(m.usage.outputTokens)}↓
                </span>
              )}
              {m.stopReason && !showStopBadge && (
                <>
                  <span className="opacity-50">·</span>
                  <span title="SDK stop_reason">{m.stopReason}</span>
                </>
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
    case 'text':
      return <TextPart text={part.text} />;
    case 'thinking':
      return <ThinkingPart text={part.text} />;
    case 'tool':
      return (
        <ToolPart
          name={part.name}
          input={part.input}
          partialInputJson={part.partialInputJson}
          result={part.result}
          status={part.status}
        />
      );
    default:
      return null;
  }
}

function partKey(p: MessagePart, i: number): string {
  if (p.kind === 'tool') return `tool:${p.toolUseId}`;
  return `${p.kind}:${i}`;
}

/** Human-readable placeholder for an assistant turn that produced no parts. */
function emptyTurnLabel(stopReason?: string): string {
  switch (stopReason) {
    case 'aborted':
      return 'Stopped before the assistant responded.';
    case 'max_turns':
      return 'Reached the turn limit before producing a response.';
    case undefined:
    case '':
      return 'No response — the turn ended before reaching the assistant.';
    default:
      return `No response (${stopReason}).`;
  }
}

/** Map a message intent tag to a short chip label, or null to hide the chip. */
function labelForIntent(tag?: string): string | null {
  switch (tag) {
    case 'add-skill':
      return 'Add Skill';
    case 'edit-skill-metadata':
      return 'Edit Metadata';
    case 'edit-skill-instructions':
      return 'Edit Instructions';
    case 'add-extension':
      return 'Add Extension';
    case 'edit-extension-metadata':
      return 'Edit Extension';
    case 'edit-extension-instructions':
      return 'Edit Guide';
    case 'steer':
      return 'Injected mid-turn';
    default:
      return null;
  }
}

/**
 * Hover-revealed Copy button for user messages. Copies text + attached
 * images in a single clipboard write so pasting into a markdown editor
 * keeps the prose, and pasting into an image-aware app gets the picture.
 */
function UserMessageActions({
  text,
  attachments,
}: {
  text: string;
  attachments: StoredAttachment[];
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'error'>('idle');

  const handleCopy = async () => {
    try {
      await copyMessage(text, attachments);
      setState('copied');
      window.setTimeout(() => setState('idle'), 1500);
    } catch (e) {
      console.error('Copy failed:', e);
      setState('error');
      window.setTimeout(() => setState('idle'), 1500);
    }
  };

  // Nothing to copy — don't render the chrome.
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
        title={state === 'error' ? 'Copy failed' : 'Copy message'}
      >
        {state === 'copied' ? (
          <>
            <Check className="h-3 w-3" strokeWidth={2} />
            <span>Copied</span>
          </>
        ) : (
          <>
            <Copy className="h-3 w-3" strokeWidth={1.75} />
            <span>{state === 'error' ? 'Failed' : 'Copy'}</span>
          </>
        )}
      </button>
    </div>
  );
}

/**
 * Build a single ClipboardItem with `text/plain` plus every image
 * attachment as its own MIME entry. Non-image attachments are listed in
 * the text body as `[file: name]` so the paste target still has a record.
 *
 * Falls back to plain-text-only if the browser rejects multi-format
 * writes (older browsers, restricted contexts).
 */
async function copyMessage(
  text: string,
  attachments: StoredAttachment[],
): Promise<void> {
  const images = attachments.filter((a) => a.type === 'image');
  const others = attachments.filter((a) => a.type !== 'image');

  // Augment the text with non-image attachment references.
  const trailers = others.length
    ? '\n\n' + others.map((a) => `[file: ${a.name}]`).join('\n')
    : '';
  const fullText = (text + trailers).trim();

  if (images.length === 0) {
    await navigator.clipboard.writeText(fullText);
    return;
  }

  // Load each image's bytes off disk and build blobs. Browsers cap a
  // ClipboardItem to one entry per MIME type — for multiple images we
  // emit multiple ClipboardItems.
  const items: ClipboardItem[] = [];
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const b64 = await readAttachmentBase64(img.storedPath);
    if (!b64) continue;
    const blob = base64ToBlob(b64, img.mimeType || 'image/png');
    const types: Record<string, Blob> = { [blob.type]: blob };
    // Pair the text with the first image so single-image paste keeps
    // both. Plain-text paste targets read the same `text/plain` from
    // the first item.
    if (i === 0 && fullText) {
      types['text/plain'] = new Blob([fullText], { type: 'text/plain' });
    }
    items.push(new ClipboardItem(types));
  }

  if (items.length === 0) {
    // Loading every image failed — degrade to text-only rather than throw.
    await navigator.clipboard.writeText(fullText);
    return;
  }

  try {
    await navigator.clipboard.write(items);
  } catch {
    // Some clipboard targets reject multi-MIME writes. Fall back to text.
    await navigator.clipboard.writeText(fullText);
  }
}

function base64ToBlob(b64: string, mimeType: string): Blob {
  const bytes = atob(b64);
  const len = bytes.length;
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mimeType });
}

/**
 * Format a token count for the compact metadata pill: 1234 → "1.2k",
 * 1_234_567 → "1.2m". Sub-1000 stays as-is (so 234 reads as 234, not 0.2k).
 */
function compactNumber(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`;
}

