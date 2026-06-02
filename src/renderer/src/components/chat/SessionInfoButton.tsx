import { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Info } from 'lucide-react';
import { Button } from '../ui';
import { TitleEditor } from './session-info/TitleEditor';
import { UsageSection } from './session-info/UsageSection';
import { FileTree } from './session-info/FileTree';
import { useSessionFiles } from './session-info/useSessionFiles';
import { useTitleEditor } from './session-info/useTitleEditor';
import type { SessionInfoButtonProps } from './session-info/types';

/**
 * Session info popover — title editor, token usage, file tree.
 * Orchestrates title editing and session file loading.
 */
export function SessionInfoButton({ sessionId, title, messages }: SessionInfoButtonProps) {
  const [open, setOpen] = useState(false);
  const disabled = !sessionId;

  const { files, loading, revealInFinder } = useSessionFiles(open, sessionId);
  const { draftTitle, setDraftTitle, commitTitle, resetDraft } = useTitleEditor(
    open,
    sessionId,
    title,
  );

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button
          variant="outline"
          size="sm"
          icon={Info}
          disabled={disabled}
          className="text-fg-muted hover:text-fg"
        >
          Info
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          side="top"
          sideOffset={8}
          collisionPadding={12}
          className="z-50 w-[420px] overflow-hidden rounded-xl border border-border bg-panel p-4 shadow-2xl"
        >
          <TitleEditor
            draftTitle={draftTitle}
            onChangeTitle={setDraftTitle}
            onCommit={() => void commitTitle()}
            onReset={resetDraft}
          />

          <UsageSection messages={messages} />

          <div className="mt-4 mb-1 flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
              Session Files
            </span>
            <button
              onClick={revealInFinder}
              className="text-xs text-fg-muted hover:text-fg hover:underline"
            >
              View in Finder
            </button>
          </div>

          <div className="scroll-thin max-h-72 overflow-y-auto pr-1">
            <FileTree nodes={files} loading={loading} />
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
