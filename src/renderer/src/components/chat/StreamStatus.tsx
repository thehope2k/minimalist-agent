// Live status footer shown beneath a streaming assistant message.
// Replaces the old animated cursor — gives the user a readable signal
// of *what* the agent is doing right now, plus an elapsed-time counter.
//
// The label is derived from the trailing message part:
//   no parts            → "Thinking"
//   thinking_delta tail → "Reasoning"
//   text tail           → "Writing"
//   running tool        → verb-for-tool ("Reading foo.ts", "Running command", …)
//   completed tool tail → "Working" (between tool_result and next event)

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { MessagePart } from '@/lib/chat';

export function StreamStatus({ parts }: { parts: MessagePart[] }) {
  const elapsed = useElapsed();
  const label = deriveLabel(parts);
  // Show a subtle warning after 90 s — at this point the turn is taking
  // longer than any normal response and is likely retrying a transient
  // network error internally (the Pi/Copilot SDK auto-retries silently).
  const isStalled = elapsed > 90_000;

  return (
    <div className="mt-2 flex items-center gap-2 text-xs text-fg-subtle">
      <Loader2 className="h-3 w-3 shrink-0 animate-spin" strokeWidth={2} />
      <span className="min-w-0 truncate">
        <span className="text-fg-muted">{label}</span>
        <span className="opacity-60">…</span>
      </span>
      <span className="ml-auto shrink-0 flex items-center gap-1.5 tabular-nums opacity-70">
        {isStalled && (
          <span
            className="text-amber-400/80"
            title="Turn is taking longer than usual — may be retrying a connection error"
          >
            ⚠️
          </span>
        )}
        {formatElapsed(elapsed)}
      </span>
    </div>
  );
}

/** Best-effort verb for an in-flight tool call. Falls back to `Using ${name}`. */
function verbFor(name: string, input: unknown): string {
  const o = (input && typeof input === 'object' ? input : null) as
    | Record<string, unknown>
    | null;
  const file =
    o && typeof o.file_path === 'string' ? basename(o.file_path) : null;

  switch (name) {
    case 'Read':
      return file ? `Reading ${file}` : 'Reading';
    case 'Write':
      return file ? `Writing ${file}` : 'Writing file';
    case 'Edit':
      return file ? `Editing ${file}` : 'Editing file';
    case 'Bash': {
      const cmd = o && typeof o.command === 'string' ? o.command : '';
      const head = cmd.split(/\s+/, 1)[0] ?? '';
      return head ? `Running ${head}` : 'Running command';
    }
    case 'Grep':
      return 'Searching';
    case 'Glob':
      return 'Finding files';
    case 'WebFetch':
      return 'Fetching';
    case 'WebSearch':
      return 'Searching the web';
    case 'Task':
      return 'Spawning subagent';
    case 'TodoWrite':
      return 'Updating tasks';
    default:
      return `Using ${name}`;
  }
}

function deriveLabel(parts: MessagePart[]): string {
  if (parts.length === 0) return 'Thinking';
  const last = parts[parts.length - 1];
  if (last.kind === 'thinking') return 'Reasoning';
  if (last.kind === 'text') return 'Writing';
  if (last.kind === 'tool') {
    if (last.status === 'running') return verbFor(last.name, last.input);
    return 'Working';
  }
  return 'Working';
}

function basename(p: string): string {
  const i = p.lastIndexOf('/');
  return i >= 0 ? p.slice(i + 1) : p;
}

/** Re-render once per second while mounted to drive the elapsed counter. */
function useElapsed(): number {
  const startRef = useRef<number>(Date.now());
  const [, force] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => force((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  return Date.now() - startRef.current;
}

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
