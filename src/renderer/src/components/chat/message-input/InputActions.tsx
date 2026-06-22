import { ArrowUp, AtSign, Paperclip, Square } from 'lucide-react';
import { IconButton } from '@/components/ui';
import { FolderPicker } from '../FolderPicker';
import { ConnectionModelPicker } from '../ConnectionModelPicker';
import { CopilotQuotaPill } from '@/components/settings/CopilotQuotaBar';
import { MOD as SHORTCUT_MOD_SYMBOL } from '@/lib/shortcuts';
import type { ConnectionMeta } from '@/lib/electron';
import type { useAiData } from '@/hooks/useAiData';

type Props = {
  isStreaming: boolean;
  canSend: boolean;
  canSteer: boolean;
  connection: ConnectionMeta | null;
  model: string | null;
  data: ReturnType<typeof useAiData>;
  cwd?: string;
  onChangeCwd: (next: string | undefined) => void;
  cwdLocked?: boolean;
  supportsVision: boolean;
  /** Active model can't accept currently-attached images. */
  hasUnsendableImages: boolean;
  onPickFiles: () => void;
  onTriggerMention: () => void;
  onPickerChange: (slug: string, modelId: string) => void;
  onSend: () => void;
  onAbort: () => void;
  onSteer: () => void;
};

export function InputActions({
  isStreaming,
  canSend,
  canSteer,
  connection,
  model,
  data,
  cwd,
  onChangeCwd,
  cwdLocked,
  supportsVision,
  hasUnsendableImages,
  onPickFiles,
  onTriggerMention,
  onPickerChange,
  onSend,
  onAbort,
  onSteer,
}: Props) {
  return (
    <div className="flex items-center justify-between border-t border-border px-2.5 pb-2 pt-1.5">
      <div className="flex items-center gap-0.5">
        <IconButton
          icon={Paperclip}
          label="Attach file"
          onClick={onPickFiles}
          title={
            hasUnsendableImages
              ? "\ud83d\udcf8 This model doesn't support images \u2014 attached images won't be sent"
              : !supportsVision
                ? 'Attach file (this model only reads text/files, not images)'
                : 'Attach file'
          }
        />
        <IconButton
          icon={AtSign}
          label="Mention skill"
          onClick={onTriggerMention}
          disabled={isStreaming || !connection}
        />
        <FolderPicker value={cwd} onChange={onChangeCwd} locked={cwdLocked} />
      </div>

      <div className="flex items-center gap-2">
        {connection && model && data && (
          <>
            <CopilotQuotaPill
              connectionSlug={connection.slug}
              isCopilot={
                connection.providerType === 'pi' &&
                connection.piAuthProvider === 'github-copilot'
              }
              isStreaming={isStreaming}
            />
            <ConnectionModelPicker
              connections={data.connections}
              activeSlug={connection.slug}
              activeModelId={model}
              onChange={onPickerChange}
              disabled={isStreaming}
              connectionLocked={false}
            />
          </>
        )}
        {isStreaming ? (
          <>
            {canSteer && (
              <button
                onClick={onSteer}
                className="grid h-7 w-7 place-items-center rounded-full bg-accent text-app transition-colors hover:bg-accent/90"
                title={`Inject into running turn (${SHORTCUT_MOD_SYMBOL}+Enter)`}
              >
                <ArrowUp className="h-3.5 w-3.5" strokeWidth={2.5} />
              </button>
            )}
            <button
              onClick={onAbort}
              className="grid h-7 w-7 place-items-center rounded-full bg-fg text-app transition-colors hover:bg-fg-muted"
              title="Stop"
            >
              <Square className="h-3 w-3 fill-current" strokeWidth={0} />
            </button>
          </>
        ) : (
          <button
            disabled={!canSend}
            onClick={onSend}
            className="grid h-7 w-7 place-items-center rounded-full bg-fg text-app transition-colors hover:bg-fg-muted disabled:bg-elevated disabled:text-fg-subtle"
            title="Send (Enter)"
          >
            <ArrowUp className="h-3.5 w-3.5" strokeWidth={2.5} />
          </button>
        )}
      </div>
    </div>
  );
}
