import { useEffect, useState } from 'react';
import { Loader2, Sparkles, TriangleAlert } from 'lucide-react';
import type { CompactionNotice as Notice } from '@/hooks/useChat';

const FADE_AFTER_MS = 8000;
const FAILURE_FADE_AFTER_MS = FADE_AFTER_MS * 2;

const RUNNING_LABEL: Record<Notice['trigger'], string> = {
  overflow: 'Recovering from context overflow…',
  manual: 'Compacting…',
  threshold: 'Compacting older messages…',
  auto: 'Compacting older messages…',
};

export function CompactionNotice({ notice }: { notice: Notice | null }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!notice) return;
    setVisible(true);
    // Replaced by its own terminal event once compaction settles, not a timer.
    if (notice.status === 'running') return;
    const t = setTimeout(
      () => setVisible(false),
      notice.status === 'failed' ? FAILURE_FADE_AFTER_MS : FADE_AFTER_MS,
    );
    return () => clearTimeout(t);
  }, [notice]);

  if (!notice || !visible) return null;

  if (notice.status === 'running') {
    return (
      <div className="mx-auto mb-2 flex w-fit items-center gap-1.5 rounded-md border border-border bg-elevated/60 px-2.5 py-1 text-xs text-fg-muted">
        <Loader2 className="h-3 w-3 animate-spin text-fg-subtle" strokeWidth={1.75} />
        <span>{RUNNING_LABEL[notice.trigger]}</span>
      </div>
    );
  }

  if (notice.status === 'failed') {
    return (
      <div className="mx-auto mb-2 flex w-fit items-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs text-red-400">
        <TriangleAlert className="h-3 w-3" strokeWidth={1.75} />
        <span>{notice.errorMessage || 'Compaction failed'}</span>
      </div>
    );
  }

  const saved = (notice.preTokens ?? 0) - (notice.postTokens ?? 0);
  const savedTxt = saved > 0 ? ` · saved ${formatK(saved)} tokens` : '';

  return (
    <div className="mx-auto mb-2 flex w-fit items-center gap-1.5 rounded-md border border-border bg-elevated/60 px-2.5 py-1 text-xs text-fg-muted">
      <Sparkles className="h-3 w-3 text-fg-subtle" strokeWidth={1.75} />
      <span>Compacted older turns{savedTxt}</span>
    </div>
  );
}

function formatK(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, '')}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`;
}
