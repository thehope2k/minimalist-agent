import { useState } from 'react';
import { Check, Copy, GitBranch, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { readAttachmentBase64 } from '@/lib/attachments';
import type { MessagePart } from '@/lib/chat';
import type { StoredAttachment } from '@/lib/electron';
import { createLogger } from '@/lib/logger';
import { Menu } from '../../../ui';
import { MentionText } from '../../MentionText';

const log = createLogger('bubble');

type UserMessageProps = {
  parts: MessagePart[];
  attachments: StoredAttachment[];
  intentTag?: string;
  onBranch?: (withContext?: boolean) => void;
};

export function UserMessage({ parts, attachments, intentTag, onBranch }: UserMessageProps) {
  const text = parts.map((part) => (part.kind === 'text' ? part.text : '')).join('');

  return (
    <>
      <div
        className={cn(
          'max-w-[80%]',
          parts.length === 0 && 'hidden',
          parts.length > 0 &&
            (intentTag === 'steer'
              ? 'rounded-2xl border border-dashed border-accent/40 bg-accent/5 px-3.5 py-2 text-sm leading-relaxed text-fg whitespace-pre-wrap wrap-break-word'
              : 'rounded-2xl bg-elevated px-4 py-2.5 text-sm leading-relaxed text-fg whitespace-pre-wrap wrap-break-word'),
        )}
      >
        <MentionText text={text} />
      </div>
      <UserMessageActions text={text} attachments={attachments} onBranch={onBranch} />
    </>
  );
}

function UserMessageActions({ text, attachments, onBranch }: {
  text: string;
  attachments: StoredAttachment[];
  onBranch?: (withContext?: boolean) => void;
}) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [branchState, setBranchState] = useState<'idle' | 'branching'>('idle');

  const handleCopy = async () => {
    try {
      await copyMessage(text, attachments);
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 1500);
    } catch (error) {
      log.error('Copy failed:', error);
      setCopyState('error');
      window.setTimeout(() => setCopyState('idle'), 1500);
    }
  };

  const handleBranch = async (withContext?: boolean) => {
    if (!onBranch || branchState === 'branching') return;
    setBranchState('branching');
    try {
      await onBranch(withContext);
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
          'opacity-0 group-hover:opacity-100',
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
        <Menu
          trigger={
            <button
              type="button"
              disabled={branchState === 'branching'}
              className={cn(
                'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-fg-subtle',
                'transition-opacity duration-150 hover:bg-elevated hover:text-fg',
                'opacity-0 group-hover:opacity-100',
                branchState === 'branching' && 'opacity-60 cursor-wait',
              )}
              title="Branch conversation from here"
            >
              <GitBranch className="h-3 w-3" strokeWidth={1.75} />
              <span>{branchState === 'branching' ? 'Branching…' : 'Branch'}</span>
            </button>
          }
          menuWidth={200}
          items={[
            { label: 'Branch (clean)', icon: GitBranch, onSelect: () => void handleBranch(false) },
            { label: 'Branch (summarized)', icon: Sparkles, onSelect: () => void handleBranch(true) },
          ]}
          footer={
            <div className="px-2 pb-1.5 pt-1 text-[10px] leading-snug text-fg-subtle">
              Clean drops the messages after this point. Summarized keeps a compressed
              memory of them instead (uses an extra AI call, takes a few seconds).
            </div>
          }
        />
      )}
    </div>
  );
}

async function copyMessage(text: string, attachments: StoredAttachment[]): Promise<void> {
  const images = attachments.filter((attachment) => attachment.type === 'image');
  const others = attachments.filter((attachment) => attachment.type !== 'image');
  const trailers = others.length ? `\n\n${others.map((attachment) => `[file: ${attachment.name}]`).join('\n')}` : '';
  const fullText = (text + trailers).trim();

  if (images.length === 0) {
    await navigator.clipboard.writeText(fullText);
    return;
  }

  const items: ClipboardItem[] = [];
  for (let index = 0; index < images.length; index++) {
    const image = images[index];
    const base64 = await readAttachmentBase64(image.storedPath);
    if (!base64) continue;
    const blob = base64ToBlob(base64, image.mimeType || 'image/png');
    const types: Record<string, Blob> = { [blob.type]: blob };
    if (index === 0 && fullText) types['text/plain'] = new Blob([fullText], { type: 'text/plain' });
    items.push(new ClipboardItem(types));
  }

  if (items.length === 0) {
    await navigator.clipboard.writeText(fullText);
    return;
  }

  try {
    await navigator.clipboard.write(items);
  } catch {
    await navigator.clipboard.writeText(fullText);
  }
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const bytes = atob(base64);
  const array = new Uint8Array(bytes.length);
  for (let index = 0; index < bytes.length; index++) array[index] = bytes.charCodeAt(index);
  return new Blob([array], { type: mimeType });
}
