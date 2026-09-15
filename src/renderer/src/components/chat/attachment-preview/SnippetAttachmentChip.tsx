import { useRef, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { FileCode } from 'lucide-react';
import { cn } from '@/lib/utils';
import { languageLabel } from '@/lib/language-detect';
import type { DraftAttachment } from '@/lib/electron';
import { SnippetEditModal } from '../SnippetEditModal';
import { RemoveButton } from './AttachmentChip';

export function SnippetAttachmentChip({
  attachment,
  onRemove,
  onUpdate,
  disabled,
}: {
  attachment: DraftAttachment;
  onRemove: () => void;
  onUpdate?: (updated: DraftAttachment) => void;
  disabled?: boolean;
}) {
  const [hoverOpen, setHoverOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleClose = () => {
    closeTimer.current = setTimeout(() => setHoverOpen(false), 80);
  };
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  };
  const preview = (attachment.text ?? '').split('\n').slice(0, 6).join('\n');
  const language = attachment.language ?? 'plaintext';
  const lineCount = attachment.lineCount ?? (attachment.text ?? '').split('\n').length;

  return (
    <>
      <Popover.Root open={hoverOpen} onOpenChange={setHoverOpen}>
        <div className="group relative shrink-0 select-none">
          {!disabled && <RemoveButton name={attachment.name} onRemove={onRemove} />}
          <Popover.Trigger asChild>
            <div
              onMouseEnter={() => {
                cancelClose();
                setHoverOpen(true);
              }}
              onMouseLeave={scheduleClose}
              onClick={() => {
                setHoverOpen(false);
                setEditing(true);
              }}
              className="flex h-16 min-w-[140px] max-w-[200px] cursor-pointer items-center gap-2.5 rounded-lg bg-elevated px-2 pr-3 transition-colors hover:bg-elevated-2"
            >
              <div className="grid h-10 w-8 shrink-0 place-items-center rounded-md bg-panel">
                <FileCode className="h-4 w-4 text-accent" strokeWidth={1.75} />
              </div>
              <div className="flex min-w-0 flex-col">
                <span
                  className="line-clamp-1 break-all text-xs font-medium text-fg"
                  title={attachment.name}
                >
                  {attachment.name}
                </span>
                <span className="text-[10px] text-fg-subtle">
                  {languageLabel(language)} · {lineCount} line{lineCount !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          </Popover.Trigger>
        </div>
        <Popover.Portal>
          <Popover.Content
            side="top"
            align="start"
            sideOffset={6}
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            className={cn(
              'z-50 max-w-[280px] rounded-lg border border-border bg-panel p-2.5 shadow-lg',
              'animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out',
              'data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
            )}
          >
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
              {attachment.name} · click to edit
            </p>
            <pre className="max-h-40 overflow-hidden text-[11px] leading-relaxed text-fg-muted whitespace-pre-wrap break-all">
              {preview}
            </pre>
            {lineCount > 6 && (
              <p className="mt-1 text-[10px] text-fg-subtle">…{lineCount - 6} more lines</p>
            )}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {editing && (
        <SnippetEditModal
          attachment={attachment}
          onSave={(updated) => {
            onUpdate?.(updated);
            setEditing(false);
          }}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  );
}
