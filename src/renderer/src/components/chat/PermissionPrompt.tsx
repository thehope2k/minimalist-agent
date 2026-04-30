// Modal triggered when the agent needs permission to run a tool in 'ask'
// mode. The main-process `canUseTool` callback round-trips through here:
//
//   main: chat:permission-request  →  this component
//   user: clicks Allow/Deny         →  chat:permission-response
//   main: resolves the canUseTool promise and the SDK proceeds
//
// One queue, one modal — if multiple requests pile up (which they shouldn't,
// since the SDK serializes tool calls per agent), we show them in order.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, ShieldX, Sparkles } from 'lucide-react';
import { Button } from '../ui';
import type { PermissionDecision, PermissionRequest } from '@/lib/electron';

/** Tools we treat as "destructive" for visual emphasis. */
const DESTRUCTIVE = new Set(['Bash', 'Write', 'Edit', 'NotebookEdit']);

export function PermissionPrompt() {
  const [queue, setQueue] = useState<PermissionRequest[]>([]);

  // Subscribe once to permission-request events from main.
  useEffect(() => {
    if (!window.api?.chat?.onPermissionRequest) return;
    return window.api.chat.onPermissionRequest((req) => {
      setQueue((q) => [...q, req]);
    });
  }, []);

  const current = queue[0] ?? null;

  const respond = async (decision: PermissionDecision) => {
    if (!current) return;
    await window.api.chat.respondPermission(current.reqId, decision);
    setQueue((q) => q.slice(1));
  };

  // Escape = deny. Doesn't matter when the modal isn't shown.
  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        void respond('deny');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.reqId]);

  if (!current) return null;
  const destructive = DESTRUCTIVE.has(current.toolName);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop — clicking it denies the request. */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={() => void respond('deny')}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="perm-title"
        className="relative w-[min(560px,calc(100vw-32px))] overflow-hidden rounded-xl border border-border bg-panel shadow-2xl"
      >
        <div className="flex items-start gap-3 border-b border-border px-5 py-4">
          <span
            className={
              'grid h-8 w-8 shrink-0 place-items-center rounded-lg ' +
              (destructive
                ? 'bg-amber-400/15 text-amber-300'
                : 'bg-accent/15 text-accent')
            }
          >
            {destructive ? (
              <AlertTriangle className="h-4 w-4" strokeWidth={2} />
            ) : (
              <Sparkles className="h-4 w-4" strokeWidth={2} />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div id="perm-title" className="text-sm font-semibold text-fg">
              Allow{' '}
              <code className="rounded bg-elevated px-1 py-0.5 font-mono text-[12px] text-fg">
                {current.toolName}
              </code>
              ?
            </div>
            <div className="mt-0.5 text-xs text-fg-subtle">
              The agent wants to run this tool. Review the input below.
              {queue.length > 1 && (
                <span className="ml-1 text-fg-muted">
                  ({queue.length - 1} more pending)
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="max-h-[40vh] overflow-auto bg-app/30 px-5 py-4">
          <ToolInputView toolName={current.toolName} input={current.input} />
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border bg-panel px-5 py-3">
          <Button
            variant="ghost"
            size="sm"
            icon={ShieldX}
            onClick={() => void respond('deny')}
            className="text-red-300 hover:text-red-200"
          >
            Deny
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void respond('allow_session')}
              title="Allow this exact tool + input combination for the rest of this session."
            >
              Allow for session
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={Check}
              onClick={() => void respond('allow_once')}
              autoFocus
            >
              Allow once
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ---- input renderer ----------------------------------------------- */

function ToolInputView({
  toolName,
  input,
}: {
  toolName: string;
  input: Record<string, unknown>;
}) {
  // Highlight a "headline" field per common tool so users get the gist
  // without parsing a JSON blob. Everything else still appears below.
  const headline = pickHeadline(toolName, input);
  const rest = headline
    ? Object.fromEntries(Object.entries(input).filter(([k]) => k !== headline.key))
    : input;

  return (
    <div className="space-y-3">
      {headline && (
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-wider text-fg-subtle">
            {headline.label}
          </div>
          <pre className="scroll-thin max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-app/60 px-3 py-2 font-mono text-[12px] leading-relaxed text-fg">
            {String(headline.value)}
          </pre>
        </div>
      )}
      {Object.keys(rest).length > 0 && (
        <div>
          {headline && (
            <div className="mb-1 text-[10px] uppercase tracking-wider text-fg-subtle">
              Other arguments
            </div>
          )}
          <pre className="scroll-thin max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-app/60 px-3 py-2 font-mono text-[11px] leading-relaxed text-fg-muted">
            {safeJson(rest)}
          </pre>
        </div>
      )}
    </div>
  );
}

function pickHeadline(
  toolName: string,
  input: Record<string, unknown>,
): { key: string; label: string; value: unknown } | null {
  const map: Record<string, { key: string; label: string }> = {
    Bash: { key: 'command', label: 'Command' },
    Write: { key: 'file_path', label: 'File' },
    Edit: { key: 'file_path', label: 'File' },
    NotebookEdit: { key: 'notebook_path', label: 'Notebook' },
    WebFetch: { key: 'url', label: 'URL' },
    Task: { key: 'prompt', label: 'Subtask' },
  };
  const cfg = map[toolName];
  if (!cfg) return null;
  const value = input[cfg.key];
  if (value === undefined || value === null) return null;
  return { key: cfg.key, label: cfg.label, value };
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
