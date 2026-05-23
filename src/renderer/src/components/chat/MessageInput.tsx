import { useEffect, useRef, useState } from 'react';
import { getDraft, setDraft } from '@/lib/input-drafts';
import { ArrowUp, AtSign, Paperclip, Square } from 'lucide-react';
import { IconButton } from '../ui';
import { ConnectionModelPicker } from './ConnectionModelPicker';
import { CopilotQuotaPill } from '../settings/CopilotQuotaBar';
import { FolderPicker } from './FolderPicker';
import { HighlightedTextarea } from './HighlightedTextarea';
import { MentionMenu, type MentionItem, type MentionMenuHandle } from './MentionMenu';
import { PermissionModeButton } from './PermissionModeButton';
import { SessionInfoButton } from './SessionInfoButton';
import { AttachmentPreview } from './AttachmentPreview';
import { ContextBadge } from './ContextBadge';
import { CompactionNotice } from './CompactionNotice';
import { useAiData } from '@/hooks/useAiData';
import { useSkills } from '@/hooks/useSkills';
import { useExtensions } from '@/hooks/useExtensions';
import { useInlineMention } from '@/hooks/useInlineMention';
import {
  fileToDraft,
  pickAttachments,
  readAttachmentPath,
  createSnippetDraft,
} from '@/lib/attachments';
import { cn } from '@/lib/utils';
import type {
  ConnectionMeta,
  DraftAttachment,
  PermissionMode,
} from '@/lib/electron';
import type { ChatMessage } from '@/lib/chat';
import type { CompactionNotice as CompactionNoticeT } from '@/hooks/useChat';

import { MOD as SHORTCUT_MOD_SYMBOL } from '@/lib/shortcuts';

type SendArgs = {
  text: string;
  connection: ConnectionMeta;
  model: string;
  cwd?: string;
  maxTurns?: number;
  permissionMode: PermissionMode;
  attachments: DraftAttachment[];
};

type Props = {
  isStreaming: boolean;
  cwd?: string;
  onChangeCwd: (next: string | undefined) => void;
  /** Locks the folder picker — set after the first message has been sent. */
  cwdLocked?: boolean;
  permissionMode: PermissionMode;
  onChangePermissionMode: (mode: PermissionMode) => void;
  onSend: (args: SendArgs) => void;
  onAbort: () => void;
  /**
   * Active turn id while streaming — used by the Steer button to inject
   * the textarea contents as a mid-turn user message.
   */
  streamingTurnId?: string | null;
  /**
   * Inject a user message into the running turn (mid-turn steer). Should
   * resolve `{ ok: false, reason }` on failure rather than throw — the
   * input clears optimistically and re-fills only on a non-ok result.
   */
  onSteer?: (message: string, attachments: DraftAttachment[]) => Promise<{ ok: boolean; reason?: string }>;
  /** Active session id (null until first send creates one). */
  sessionId: string | null;
  /** Current session title — shown in the Info popover. */
  title: string;
  /** Conversation so far — used to derive the context-usage badge. */
  messages: ChatMessage[];
  /** Most recent SDK compaction event (for the transient notice). */
  lastCompaction: CompactionNoticeT | null;
  projectDefaultConnectionSlug?: string;
  sessionConnectionSlug?: string;
  sessionModel?: string;
  loadedSessionPickId?: string | null;
  /**
   * Pre-composed text to fill into the editor (e.g. from phase action buttons).
   * Once consumed the parent should clear it via onPendingMessageConsumed.
   */
  pendingMessage?: string;
  onPendingMessageConsumed?: () => void;
};

export function MessageInput({
  isStreaming,
  cwd,
  onChangeCwd,
  cwdLocked,
  permissionMode,
  onChangePermissionMode,
  onSend,
  onAbort,
  onSteer,
  streamingTurnId,
  sessionId,
  title,
  messages,
  lastCompaction,
  projectDefaultConnectionSlug,
  sessionConnectionSlug,
  sessionModel,
  loadedSessionPickId,
  pendingMessage,
  onPendingMessageConsumed,
}: Props) {
  const [value, setValue] = useState('');
  // Per-session text drafts — delegated to the module-level `input-drafts`
  // store so SessionsPanel can observe the null-slot state without prop
  // threading. The pattern is identical: save on leave, restore on enter.
  const draftValueRef = useRef(value); // always-current mirror, avoids stale closure
  draftValueRef.current = value;
  const draftPrevIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const prevId = draftPrevIdRef.current;
    if (prevId !== undefined) {
      setDraft(prevId, draftValueRef.current);
    }
    draftPrevIdRef.current = sessionId;
    setValue(getDraft(sessionId));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]); // intentionally excludes `value` — draftValueRef handles staleness
  // Fills the editor when a phase action button sets a pending message.
  // prevPendingRef prevents double-application within a render cycle;
  // reset on clear so the same message can be re-injected across sessions.
  const prevPendingRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (pendingMessage && pendingMessage !== prevPendingRef.current) {
      prevPendingRef.current = pendingMessage;
      setValue(pendingMessage);
      onPendingMessageConsumed?.();
      requestAnimationFrame(() => textareaRef.current?.focus());
    } else if (!pendingMessage) {
      prevPendingRef.current = undefined;
    }
  }, [pendingMessage, onPendingMessageConsumed]);
  const [attachments, setAttachments] = useState<DraftAttachment[]>([]);
  const [loadingCount, setLoadingCount] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dragDepth = useRef(0);
  const data = useAiData();

  // Mention picker — surfaces installed skills, enabled extensions, and
  // project files.
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const skills = useSkills() ?? [];
  const extensions = useExtensions() ?? [];
  const {
    state: mention,
    recompute: recomputeMention,
    reset: resetMention,
  } = useInlineMention(textareaRef);
  const mentionHandleRef = useRef<MentionMenuHandle | null>(null);

  /**
   * Replace the in-progress `@…` token with the appropriate mention syntax
   * for the picked item and refocus.
   */
  const insertMention = (item: MentionItem) => {
    const el = textareaRef.current;
    if (!el || mention.triggerIndex < 0) return;
    const before = value.slice(0, mention.triggerIndex);
    const after = value.slice(mention.cursor);
    let token: string;
    if (item.kind === 'skill') {
      token = `@${item.skill.slug}`;
    } else if (item.kind === 'extension') {
      token = `@${item.extension.slug}`;
    } else {
      // Folders get a trailing slash so the resolver can prefer the
      // directory marker over the file marker on the same name.
      token =
        item.entry.type === 'directory'
          ? `@${item.entry.relativePath}/`
          : `@${item.entry.relativePath}`;
    }
    const insertion = `${token} `;
    const next = before + insertion + after;
    setValue(next);
    resetMention();
    // Restore caret right after the inserted token.
    requestAnimationFrame(() => {
      const pos = before.length + insertion.length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  /** Programmatic `@` trigger from the toolbar AtSign button. */
  const triggerMentionFromButton = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    const cursor = el.selectionStart ?? value.length;
    const before = value.slice(0, cursor);
    const needsSpace = before.length > 0 && !/\s$/.test(before);
    const insertion = `${needsSpace ? ' ' : ''}@`;
    const next = before + insertion + value.slice(cursor);
    setValue(next);
    requestAnimationFrame(() => {
      const pos = before.length + insertion.length;
      el.setSelectionRange(pos, pos);
      recomputeMention();
    });
  };

  const [pickerOverride, setPickerOverride] = useState<{
    slug: string;
    modelId: string;
  } | null>(null);

  const lastSyncedSessionIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (sessionId === null) {
      // Fresh chat — clear any leftover pick from the previous session.
      if (lastSyncedSessionIdRef.current !== null) {
        lastSyncedSessionIdRef.current = null;
        setPickerOverride(null);
      }
      return;
    }
    // Wait for the data to belong to the current session.
    if (loadedSessionPickId !== sessionId) return;
    // Already synced for this session id; don't clobber a user pick.
    if (lastSyncedSessionIdRef.current === sessionId) return;
    lastSyncedSessionIdRef.current = sessionId;
    if (sessionConnectionSlug && sessionModel) {
      setPickerOverride({ slug: sessionConnectionSlug, modelId: sessionModel });
    } else {
      setPickerOverride(null);
    }
  }, [sessionId, loadedSessionPickId, sessionConnectionSlug, sessionModel]);

  const connection = data
    ? (pickerOverride &&
        data.connections.find((c) => c.slug === pickerOverride.slug)) ||
      (projectDefaultConnectionSlug &&
        data.connections.find(
          (c) => c.slug === projectDefaultConnectionSlug,
        )) ||
      data.connections.find((c) => c.slug === data.defaultSlug) ||
      data.connections[0] ||
      null
    : null;
  const model =
    (connection &&
      ((pickerOverride?.slug === connection.slug
        ? connection.models.find((m) => m.id === pickerOverride.modelId)?.id
        : null) ??
        connection.models.find((m) => m.id === data?.settings.defaultModel)
          ?.id ??
        connection.defaultModel)) ||
    null;

  const canSend = !isStreaming && (!!value.trim() || attachments.length > 0) && !!connection && !!model;
  /** Mid-turn steer — available while streaming with text or attachments. */
  const canSteer =
    isStreaming && !!streamingTurnId && (!!value.trim() || attachments.length > 0) && !!onSteer;

  const handleSteer = async () => {
    if (!canSteer || !streamingTurnId || !onSteer) return;
    const text = value.trim();
    const pendingAttachments = attachments;
    setValue('');
    setAttachments([]);
    try {
      const result = await onSteer(text, pendingAttachments);
      if (!result.ok) {
        // Re-fill the textarea and attachments so the user can re-try / edit.
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

  const handleSend = () => {
    if (!canSend || !connection || !model) return;
    onSend({
      text: value,
      connection,
      model,
      cwd,
      maxTurns: data?.settings.maxTurns,
      permissionMode,
      attachments,
    });
    setValue('');
    setAttachments([]);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Mention menu navigation takes priority when active.
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
    // Cmd/Ctrl+Enter while a turn is streaming → steer (inject mid-turn).
    // Plain Enter starts a new turn — and is silently inert while streaming
    // so power users have to mean it via the modifier (and the inline hint
    // explains why pressing Enter alone does nothing).
    if (e.key === 'Enter' && !e.shiftKey && (e.metaKey || e.ctrlKey)) {
      if (canSteer) {
        e.preventDefault();
        void handleSteer();
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const addDrafts = (drafts: DraftAttachment[]) => {
    if (drafts.length > 0) setAttachments((prev) => [...prev, ...drafts]);
  };

  const handlePickFiles = async () => {
    setError(null);
    try {
      const drafts = await pickAttachments();
      addDrafts(drafts);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to read files.');
    }
  };

  const onDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    setError(null);

    // Mix of File objects (from outside the app) and platform paths.
    // Electron extends DataTransferItem with a `getAsFile()` plus a custom
    // `path` on File for native drops.
    const dropped = Array.from(e.dataTransfer.files) as Array<File & { path?: string }>;
    if (dropped.length === 0) return;

    setLoadingCount(dropped.length);
    try {
      const out: DraftAttachment[] = [];
      for (const f of dropped) {
        try {
          // Prefer the native path (lets main re-read large files / detect type
          // from extension); fall back to in-renderer File reading.
          const draft = f.path
            ? await readAttachmentPath(f.path)
            : await fileToDraft(f);
          if (draft) out.push(draft);
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Failed to read a file.');
        }
      }
      addDrafts(out);
    } finally {
      setLoadingCount(0);
    }
  };

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };
  const onDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragDepth.current++;
    if (dragDepth.current === 1) setDragging(true);
  };
  const onDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };

  const onPaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData.items;
    const fileItems: File[] = [];
    for (const it of Array.from(items)) {
      if (it.kind === 'file') {
        const f = it.getAsFile();
        if (f) fileItems.push(f);
      }
    }

    // Large plain-text paste (no files): auto-convert to a snippet chip.
    if (fileItems.length === 0) {
      const pasted = e.clipboardData.getData('text/plain');
      const isLarge = pasted.split('\n').length >= 30 || pasted.length >= 1_500;
      if (isLarge) {
        e.preventDefault();
        addDrafts([createSnippetDraft(pasted)]);
      }
      return;
    }

    e.preventDefault();
    setError(null);
    setLoadingCount(fileItems.length);
    try {
      const out: DraftAttachment[] = [];
      for (const f of fileItems) {
        try {
          const draft = await fileToDraft(f);
          out.push(draft);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to read a pasted file.');
        }
      }
      addDrafts(out);
    } finally {
      setLoadingCount(0);
    }
  };

return (
    <div className="mx-auto w-full max-w-240">
      <CompactionNotice notice={lastCompaction} />

      <div className="mb-2 flex items-center gap-2 px-1">
        <PermissionModeButton
          value={permissionMode}
          onChange={onChangePermissionMode}
          disabled={isStreaming}
        />
        <div className="flex-1" />
        {model && connection && (
          <ContextBadge
            messages={messages}
            contextWindow={
              connection.models.find((m) => m.id === model)?.contextWindow ??
              200_000
            }
          />
        )}
        <SessionInfoButton sessionId={sessionId} title={title} messages={messages} />
      </div>

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
        <AttachmentPreview
          attachments={attachments}
          onRemove={(i) =>
            setAttachments((prev) => prev.filter((_, idx) => idx !== i))
          }
          onUpdate={(i, updated) =>
            setAttachments((prev) => prev.map((a, idx) => idx === i ? updated : a))
          }
          loadingCount={loadingCount}
          disabled={isStreaming}
        />

{error && (
          <div className="border-b border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-300">
            {error}
          </div>
        )}

        {/* Intentionally chrome-less: the rounded card supplies the border.
            Don't swap to <Textarea>, which adds its own border via FIELD_CHROME. */}
        <div className="relative">
          <HighlightedTextarea
            ref={textareaRef}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              // Recompute on the next tick so `selectionStart` reflects the new value.
              requestAnimationFrame(recomputeMention);
            }}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onBlur={() => {
              // Defer reset so mousedown on a menu item can still fire.
              setTimeout(resetMention, 120);
            }}
            rows={4}
            placeholder={
              connection
                ? 'Ask anything…'
                : 'Add a connection in Settings → AI to start chatting'
            }
            disabled={!connection}
          />
          <MentionMenu
            open={mention.active}
            query={mention.query}
            skills={skills}
            extensions={extensions}
            cwd={cwd}
            onSelect={insertMention}
            onClose={resetMention}
            handleRef={mentionHandleRef}
          />
        </div>

        {isStreaming && (
          // Inline hint while a turn is running. Send (⏎) is gated to
          // avoid two parallel turns on the same session, but the user
          // can still inject this message into the running turn with the
          // modifier shortcut.
          <div className="flex items-center justify-end gap-1.5 border-t border-border/60 px-3 pb-1 pt-1.5 text-[10px] text-fg-subtle">
            <span>Send paused while running ·</span>
            <kbd className="rounded border border-border bg-elevated/60 px-1 py-px font-mono text-[10px] leading-none text-fg-muted">
              {SHORTCUT_MOD_SYMBOL}
            </kbd>
            <kbd className="rounded border border-border bg-elevated/60 px-1 py-px font-mono text-[10px] leading-none text-fg-muted">
              ⏎
            </kbd>
            <span>to inject this message into the turn</span>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border px-2.5 pb-2 pt-1.5">
          <div className="flex items-center gap-0.5">
            <IconButton
              icon={Paperclip}
              label="Attach file"
              onClick={handlePickFiles}
            />
            <IconButton
              icon={AtSign}
              label="Mention skill"
              onClick={triggerMentionFromButton}
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
                  onChange={(slug, id) =>
                    setPickerOverride({ slug, modelId: id })
                  }
                  disabled={isStreaming}
                  connectionLocked={messages.length > 0}
                />
              </>
            )}
            {isStreaming ? (
              <>
                {canSteer && (
                  <button
                    onClick={() => void handleSteer()}
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
                onClick={handleSend}
                className="grid h-7 w-7 place-items-center rounded-full bg-fg text-app transition-colors hover:bg-fg-muted disabled:bg-elevated disabled:text-fg-subtle"
                title="Send (Enter)"
              >
                <ArrowUp className="h-3.5 w-3.5" strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

