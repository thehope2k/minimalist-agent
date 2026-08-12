import { CopyButton } from '@/components/ui';

interface SessionIdRowProps {
  sessionId: string;
}

/** Read-only session ID row — useful for cross-referencing logs/traces. */
export function SessionIdRow({ sessionId }: SessionIdRowProps) {
  return (
    <div className="group mt-3 flex items-center justify-between gap-2">
      <span className="shrink-0 text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
        Session ID
      </span>
      <span className="truncate font-mono text-xs text-fg-muted" title={sessionId}>
        {sessionId}
      </span>
      <CopyButton text={sessionId} className="shrink-0 opacity-100" />
    </div>
  );
}
