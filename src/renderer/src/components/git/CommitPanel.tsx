// Commit message editor + commit button — pinned to the bottom of the
// left panel in the git diff modal.
//
// Cmd+Enter submits. "Amend" checkbox pre-fills the last commit message
// and runs git commit --amend.

import { useRef, useState } from 'react';
import { Check, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CommitPanelProps {
  stagedCount: number;
  totalCount: number;
  stagedRepos: string[];
  onCommit: (message: string, amend: boolean) => Promise<void>;
  onFetchLastMessage: () => Promise<string | null>;
  onGenerateMessage: (amend: boolean, userContext?: string) => Promise<string | null>;
  committing: boolean;
  error: string | null;
}

export function CommitPanel({
  stagedCount,
  totalCount,
  stagedRepos,
  onCommit,
  onFetchLastMessage,
  onGenerateMessage,
  committing,
  error,
}: CommitPanelProps) {
  const [message, setMessage] = useState('');
  const [amend, setAmend] = useState(false);
  const [fetchingAmend, setFetchingAmend] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const savedMessageRef = useRef('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canCommit = stagedCount > 0 && message.trim().length > 0 && !committing && !generating;

  const handleGenerate = async () => {
    setGenerating(true);
    setGenerateError(null);
    try {
      // Use existing message as context if present
      const userContext = message.trim() || undefined;
      const generated = await onGenerateMessage(amend, userContext);
      if (generated) {
        setMessage(generated);
      } else {
        setGenerateError('No message returned. Check your connection is configured.');
      }
    } catch (e) {
      setGenerateError(e instanceof Error ? e.message : 'Generation failed');
    } finally {
      setGenerating(false);
      textareaRef.current?.focus();
    }
  };

  const handleSubmit = () => {
    if (!canCommit) return;
    void onCommit(message.trim(), amend).then(() => {
      setMessage('');
      savedMessageRef.current = '';
      setAmend(false);
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleToggleAmend = async () => {
    const next = !amend;
    setAmend(next);
    if (next) {
      // Checking: save current message, then pre-fill with last commit.
      savedMessageRef.current = message;
      setFetchingAmend(true);
      try {
        const lastMsg = await onFetchLastMessage();
        if (lastMsg) setMessage(lastMsg);
      } finally {
        setFetchingAmend(false);
      }
    } else {
      // Unchecking: restore the message that was there before.
      setMessage(savedMessageRef.current);
    }
    textareaRef.current?.focus();
  };

  return (
    <div className="shrink-0 border-t border-border/60 bg-panel px-3.5 py-3.5">
      {/* Amend + Generate on one row above the textarea */}
      <div className="mb-2 flex items-center justify-between">
        {/* Amend checkbox */}
        <button
          type="button"
          onClick={() => void handleToggleAmend()}
          disabled={committing}
          className="flex items-center gap-2 text-xs text-fg-muted hover:text-fg focus-visible:outline-none disabled:opacity-50"
        >
          <div className={cn(
            'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border transition-colors',
            amend ? 'border-amber-400 bg-amber-400/20' : 'border-border-strong',
          )}>
            {amend && <Check className="h-2.5 w-2.5 text-amber-400" strokeWidth={2.5} />}
          </div>
          <span className={amend ? 'text-amber-300' : ''}>
            Amend
          </span>
          {fetchingAmend && <Loader2 className="h-3 w-3 animate-spin text-fg-subtle" strokeWidth={2} />}
        </button>

        {/* Generate with AI */}
        <button
          type="button"
          onClick={() => void handleGenerate()}
          disabled={stagedCount === 0 || generating || committing}
          title="Generate commit message with AI"
          className={cn(
            'flex items-center gap-1.5 rounded px-2 py-1 text-[11px] transition-colors',
            'focus-visible:outline-none',
            stagedCount > 0 && !generating && !committing
              ? 'text-accent hover:bg-accent/10'
              : 'cursor-not-allowed text-fg-subtle/50',
          )}
        >
          {generating
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
            : <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />
          }
          {generating ? 'Generating…' : 'Generate'}
        </button>
      </div>
      <textarea
        ref={textareaRef}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={committing || fetchingAmend || generating}
        placeholder="Type intent (e.g., 'fix login timeout') then Generate, or write commit message directly…"
        rows={6}
        className={cn(
          'scroll-thin w-full resize-none rounded-md border border-border bg-elevated/60',
          'px-3 py-2.5 text-sm leading-relaxed text-fg placeholder:text-fg-subtle',
          'focus:border-accent/60 focus:outline-none',
          'disabled:opacity-50',
          amend && 'border-amber-500/40',
        )}
      />

      {/* Footer row */}
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="min-w-0 flex-1 truncate text-xs text-fg-muted">
          {stagedCount > 0 ? (
            <>
              {stagedRepos.length > 1 && (
                <span className="text-fg-subtle">{stagedRepos.join(', ')} · </span>
              )}
              {stagedCount} of {totalCount} file{totalCount !== 1 ? 's' : ''}
            </>
          ) : (
            <span className="text-fg-subtle">No files staged</span>
          )}
        </span>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canCommit}
          className={cn(
            'flex shrink-0 items-center gap-2 rounded-md px-5 py-2 text-sm font-medium transition-colors',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent',
            canCommit
              ? amend
                ? 'bg-amber-500/80 text-white hover:bg-amber-500'
                : 'bg-accent text-accent-fg hover:bg-accent-hover'
              : 'cursor-not-allowed bg-elevated text-fg-subtle',
          )}
        >
          {committing && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />}
          {amend ? 'Amend' : 'Commit'}
        </button>
      </div>

      {(error || generateError) && (
        <div className="mt-2 rounded bg-red-500/10 px-3 py-2">
          <p className="font-mono text-xs leading-relaxed text-red-400">{error ?? generateError}</p>
        </div>
      )}
    </div>
  );
}
