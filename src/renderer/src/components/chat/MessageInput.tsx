import { useEffect, useRef, useState } from 'react';
import { ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MessageToolbar } from './message-input/MessageToolbar';
import { StatusFooter } from './message-input/StatusFooter';
import { MessageTextarea } from './message-input/MessageTextarea';
import { AttachmentSection } from './message-input/AttachmentSection';
import { InputActions } from './message-input/InputActions';
import { useDraftPersistence } from './message-input/useDraftPersistence';
import { useMentionHandling } from './message-input/useMentionHandling';
import { useAttachments } from './message-input/useAttachments';
import { useModelPicker } from './message-input/useModelPicker';
import { usePendingMessage } from './message-input/usePendingMessage';
import { useVoiceDictation } from './message-input/useVoiceDictation';
import type { MessageInputProps, SendArgs } from './message-input/types';

export type { SendArgs };

/**
 * Message input orchestrator. Combines draft persistence, mentions,
 * attachments, model picker, and keyboard handling into a cohesive
 * composition UI.
 */
export function MessageInput({
  isStreaming,
  cwd,
  onChangeCwd,
  cwdLocked,
  permissionMode,
  onChangePermissionMode,
  autonomyLevel,
  onChangeAutonomyLevel,
  thinkingLevel,
  onChangeThinkingLevel,
  onSend,
  onAbort,
  onSteer,
  onManualCompact,
  streamingTurnId,
  sessionId,
  title,
  messages,
  lastCompaction,
  projectDefaultConnectionSlug,
  projectDefaultModel,
  sessionConnectionSlug,
  sessionModel,
  loadedSessionPickId,
  pendingMessage,
  onPendingMessageConsumed,
}: MessageInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Collapses the composer to a reopen pill.
  const [collapsed, setCollapsed] = useState(false);
  // Abort/steer must stay reachable while streaming.
  useEffect(() => {
    if (isStreaming) setCollapsed(false);
  }, [isStreaming]);
  useEffect(() => {
    setCollapsed(false);
  }, [sessionId]);

  // Model picker — resolves connection/model from overrides, defaults
  const {
    data,
    connection,
    model,
    pickerOverride,
    setPickerOverride,
  } = useModelPicker(
    sessionId,
    projectDefaultConnectionSlug,
    projectDefaultModel,
    sessionConnectionSlug,
    sessionModel,
    loadedSessionPickId,
  );

  // Attachments — file picker, drag-drop, paste, vision validation
  const {
    attachments,
    loadingCount,
    dragging,
    error,
    supportsVision,
    hasUnsendableImages,
    visionNotice,
    setError,
    setAttachments,
    clearAttachments,
    removeAttachment,
    updateAttachment,
    handlePickFiles,
    onDrop,
    onDragOver,
    onDragEnter,
    onDragLeave,
    onPaste,
  } = useAttachments(connection, model);

  // Drop images the active (non-vision) model can't accept. Kept in the draft
  // for display/restore, but never sent — matches VS Code's strike-through.
  const sendableAttachments = (atts: typeof attachments) =>
    supportsVision ? atts : atts.filter((a) => a.type !== 'image');

  // Mentions — @skill, @extension, @file
  const {
    skills,
    extensions,
    mention,
    mentionHandleRef,
    recomputeMention,
    resetMention,
    insertMention,
    triggerMentionFromButton,
  } = useMentionHandling(textareaRef, value, setValue);

  // Draft persistence — save/restore text + attachments per session
  useDraftPersistence(
    sessionId,
    value,
    attachments,
    pickerOverride,
    (text, restoredAttachments) => {
      setValue(text);
      setAttachments(restoredAttachments);
    },
  );

  // Pending message injection (e.g. from phase action buttons)
  usePendingMessage(pendingMessage, onPendingMessageConsumed, setValue, textareaRef);
  // Needs a visible textarea to focus and land the text in.
  useEffect(() => {
    if (pendingMessage) setCollapsed(false);
  }, [pendingMessage]);

  // Voice dictation — on-device transcription inserted at cursor
  const voice = useVoiceDictation(textareaRef, value, setValue);
  const handleToggleVoice = () => {
    if (voice.recording) {
      void voice.stopRecording();
    } else {
      void voice.startRecording();
    }
  };

  const voiceActiveRef = useRef(voice.recording || voice.starting || voice.transcribing);
  voiceActiveRef.current = voice.recording || voice.starting || voice.transcribing;
  const abandonRecordingRef = useRef(voice.abandonRecording);
  abandonRecordingRef.current = voice.abandonRecording;
  const prevSessionIdRef = useRef(sessionId);
  useEffect(() => {
    if (prevSessionIdRef.current !== sessionId) {
      prevSessionIdRef.current = sessionId;
      if (voiceActiveRef.current) void abandonRecordingRef.current();
    }
  }, [sessionId]);

  // Cmd/Ctrl+Shift+M — global voice-dictation toggle. Guard conditions match
  // the mic button's disabled state exactly. Registered once; refs (not a
  // dependency array) keep the handler reading current values without
  // re-subscribing the window listener on every render.
  const voiceShortcutBlocked =
    isStreaming ||
    voice.modelStatus === 'downloading' ||
    voice.transcribing ||
    voice.starting;
  const voiceShortcutBlockedRef = useRef(voiceShortcutBlocked);
  voiceShortcutBlockedRef.current = voiceShortcutBlocked;
  const handleToggleVoiceRef = useRef(handleToggleVoice);
  handleToggleVoiceRef.current = handleToggleVoice;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || !e.shiftKey || e.key.toLowerCase() !== 'm') return;
      if (voiceShortcutBlockedRef.current) return;
      e.preventDefault();
      handleToggleVoiceRef.current();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Send / steer logic
  const canSend =
    !isStreaming &&
    (!!value.trim() || attachments.length > 0) &&
    !!connection &&
    !!model;

  const canSteer =
    isStreaming &&
    !!streamingTurnId &&
    (!!value.trim() || attachments.length > 0) &&
    !!onSteer;

  const handleSend = () => {
    if (!canSend || !connection || !model) return;
    if (voice.recording || voice.starting || voice.transcribing) void voice.abandonRecording();
    const outgoing = sendableAttachments(attachments);
    if (!value.trim() && outgoing.length === 0) return;
    onSend({
      text: value,
      connection,
      model,
      cwd,
      maxTurns: data?.settings.maxTurns,
      permissionMode,
      autonomyLevel,
      thinkingLevel,
      attachments: outgoing,
    });
    setValue('');
    clearAttachments();
  };

  const handleSteer = async () => {
    if (!canSteer || !streamingTurnId || !onSteer) return;
    if (voice.recording || voice.starting || voice.transcribing) void voice.abandonRecording();
    const text = value.trim();
    const pendingAttachments = attachments;
    const outgoing = sendableAttachments(pendingAttachments);
    setValue('');
    clearAttachments();
    try {
      const result = await onSteer(text, outgoing);
      if (!result.ok) {
        setValue(text);
        setAttachments(pendingAttachments);
        setError(`Steer failed: ${result.reason ?? 'unknown'}`);
      }
    } catch (e) {
      setValue(text);
      setAttachments(pendingAttachments);
      setError(e instanceof Error ? e.message : 'Steer failed.');
    }
  };

  // Keyboard handling
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Mention menu navigation takes priority when active
    if (mention.active) {
      if (e.key === 'Escape') {
        e.preventDefault();
        resetMention();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        mentionHandleRef.current?.moveDown();
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        mentionHandleRef.current?.moveUp();
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (mentionHandleRef.current?.confirm()) {
          e.preventDefault();
          return;
        }
      }
    }

    // Cmd/Ctrl+Enter while streaming → steer (inject mid-turn)
    if (e.key === 'Enter' && !e.shiftKey && (e.metaKey || e.ctrlKey)) {
      if (canSteer) {
        e.preventDefault();
        void handleSteer();
        return;
      }
    }

    // Plain Enter → send
    if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      <StatusFooter lastCompaction={lastCompaction} isStreaming={isStreaming} />

      {collapsed ? (
        <div className="mx-auto flex w-full max-w-240 justify-center pb-3">
          <button
            onClick={() => setCollapsed(false)}
            className="flex items-center gap-1.5 rounded-full border border-border bg-panel px-3 py-1.5 text-xs text-fg-muted shadow-md transition-colors hover:bg-elevated hover:text-fg"
          >
            <ChevronUp className="h-3.5 w-3.5" />
            Show composer
          </button>
        </div>
      ) : (
        <div className="mx-auto w-full max-w-240">
          <MessageToolbar
            permissionMode={permissionMode}
            onChangePermissionMode={onChangePermissionMode}
            autonomyLevel={autonomyLevel}
            onChangeAutonomyLevel={onChangeAutonomyLevel}
            thinkingLevel={thinkingLevel}
            onChangeThinkingLevel={onChangeThinkingLevel}
            isStreaming={isStreaming}
            sessionId={sessionId}
            title={title}
            messages={messages}
            connection={connection}
            model={model}
            onManualCompact={onManualCompact}
            onMinimize={() => setCollapsed(true)}
          />

          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragEnter={onDragEnter}
            onDragLeave={onDragLeave}
            className={cn(
              'rounded-xl border bg-elevated/60 shadow-sm transition-colors',
              dragging ? 'border-accent' : 'border-border',
            )}
          >
            <AttachmentSection
              attachments={attachments}
              loadingCount={loadingCount}
              supportsVision={supportsVision}
              onRemove={removeAttachment}
              onUpdate={updateAttachment}
            />

            {visionNotice && (
              <div className="border-b border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300/90">
                {visionNotice}
              </div>
            )}

            {error && (
              <div className="border-b border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-300">
                {error}
              </div>
            )}

            {voice.error && (
              <div className="border-b border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-300">
                {voice.error}
              </div>
            )}

            {voice.modelStatus === 'downloading' && (
              <div className="border-b border-border bg-elevated/60 px-3 py-1.5 text-xs text-fg-muted">
                Downloading on-device voice model…
                {voice.downloadProgress?.totalBytes
                  ? ` ${Math.round((voice.downloadProgress.downloadedBytes / voice.downloadProgress.totalBytes) * 100)}%`
                  : ''}
              </div>
            )}

            <MessageTextarea
              textareaRef={textareaRef}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                requestAnimationFrame(recomputeMention);
              }}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              onBlur={() => {
                setTimeout(resetMention, 120);
              }}
              disabled={!connection}
              placeholder={
                connection
                  ? 'Ask anything…'
                  : 'Add a connection in Settings → AI to start chatting'
              }
              mention={mention}
              mentionHandleRef={mentionHandleRef}
              skills={skills}
              extensions={extensions}
              cwd={cwd}
              onMentionSelect={insertMention}
              onMentionClose={resetMention}
            />

            <InputActions
              isStreaming={isStreaming}
              canSend={canSend}
              canSteer={canSteer}
              connection={connection}
              model={model}
              data={data}
              cwd={cwd}
              onChangeCwd={onChangeCwd}
              cwdLocked={cwdLocked}
              supportsVision={supportsVision}
              hasUnsendableImages={hasUnsendableImages}
              onPickFiles={handlePickFiles}
              onTriggerMention={triggerMentionFromButton}
              onPickerChange={(slug, modelId) =>
                setPickerOverride({ slug, modelId })
              }
              onSend={handleSend}
              onAbort={onAbort}
              onSteer={() => void handleSteer()}
              voiceRecording={voice.recording}
              voiceStarting={voice.starting}
              voiceTranscribing={voice.transcribing}
              voiceModelStatus={voice.modelStatus}
              onToggleVoice={handleToggleVoice}
            />
          </div>
        </div>
      )}
    </>
  );
}
