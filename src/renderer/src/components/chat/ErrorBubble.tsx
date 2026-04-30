import { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, ChevronDown } from 'lucide-react';
import type { AgentError } from '@/lib/electron';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';

/**
 * Shown beneath an assistant bubble that ended in error. Renders a
 * compact card with title, prose, optional retry, and a collapsible
 * "diagnostics" disclosure for the underlying SDK message.
 *
 * `legacyText` is rendered when the message has no structured `errorInfo`
 * (older sessions persisted only a free-form string).
 */
export function ErrorBubble({
  error,
  legacyText,
  onRetry,
  isRetrying,
}: {
  error?: AgentError;
  legacyText?: string;
  onRetry?: () => void;
  isRetrying?: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (!error) {
    if (!legacyText) return null;
    return (
      <div className="mt-1 flex items-start gap-1.5 text-xs text-red-300">
        <AlertTriangle size={12} className="mt-0.5 shrink-0" />
        <span className="break-words">{legacyText}</span>
      </div>
    );
  }

  const palette = paletteFor(error);

  return (
    <div
      className={cn(
        'mt-2 max-w-full overflow-hidden rounded-md border text-xs',
        palette.border,
        palette.bg,
      )}
    >
      <div className="flex items-start gap-2 p-3">
        <AlertTriangle size={14} className={cn('mt-0.5 shrink-0', palette.icon)} />
        <div className="min-w-0 flex-1">
          <div className={cn('font-medium', palette.title)}>{error.title}</div>
          <div className="mt-0.5 text-fg-muted">{error.message}</div>

          {error.retryAfterMs != null && (
            <RetryAfterCountdown deadline={error.retryAfterMs} />
          )}

          {(error.canRetry || error.originalError) && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {error.canRetry && onRetry && (
                <Button
                  variant="outline"
                  size="sm"
                  icon={RefreshCw}
                  onClick={onRetry}
                  disabled={isRetrying}
                >
                  {isRetrying ? 'Retrying…' : 'Retry'}
                </Button>
              )}
              {error.originalError && (
                <button
                  type="button"
                  onClick={() => setOpen((v) => !v)}
                  className="inline-flex items-center gap-1 text-fg-subtle hover:text-fg-muted"
                >
                  <ChevronDown
                    size={12}
                    className={cn(
                      'transition-transform',
                      open && 'rotate-180',
                    )}
                  />
                  {open ? 'Hide diagnostics' : 'Show diagnostics'}
                </button>
              )}
            </div>
          )}

          {open && error.originalError && (
            <pre className="scroll-thin mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-canvas/60 p-2 font-mono text-[11px] leading-relaxed text-fg-subtle">
              {error.originalError}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Live countdown for an exact `retry-after` window from the API. The
 * `deadline` arg is the original ms-from-now (set when the bubble first
 * mounted); we anchor a wall-clock deadline once and tick every second.
 */
function RetryAfterCountdown({ deadline }: { deadline: number }) {
  const [endsAt] = useState(() => Date.now() + deadline);
  const [remaining, setRemaining] = useState(() => Math.max(0, endsAt - Date.now()));

  useEffect(() => {
    if (remaining <= 0) return;
    const t = setInterval(() => {
      setRemaining(Math.max(0, endsAt - Date.now()));
    }, 1000);
    return () => clearInterval(t);
  }, [endsAt, remaining]);

  if (remaining <= 0) {
    return (
      <div className="mt-1 font-mono text-[11px] text-fg-subtle">
        Ready to retry.
      </div>
    );
  }
  return (
    <div className="mt-1 font-mono text-[11px] text-fg-subtle">
      Retry in {formatDuration(remaining)}
    </div>
  );
}

function formatDuration(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m === 0) return `${s}s`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Color palette per error severity. Auth/billing errors are loud red;
 *  transient stuff (rate-limit, network, max-turns) gets amber. */
function paletteFor(err: AgentError): {
  border: string;
  bg: string;
  icon: string;
  title: string;
} {
  const fatal: Set<AgentError['code']> = new Set([
    'invalid_api_key',
    'expired_oauth_token',
    'billing_error',
    'invalid_model',
    'model_no_tool_support',
  ]);
  if (fatal.has(err.code)) {
    return {
      border: 'border-red-500/30',
      bg: 'bg-red-500/5',
      icon: 'text-red-400',
      title: 'text-red-300',
    };
  }
  return {
    border: 'border-amber-500/30',
    bg: 'bg-amber-500/5',
    icon: 'text-amber-400',
    title: 'text-amber-300',
  };
}
