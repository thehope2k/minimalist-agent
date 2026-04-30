import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { CompactionNotice as Notice } from '@/hooks/useChat';

const FADE_AFTER_MS = 8000;

/**
 * Transient "Compacted older turns · saved Nk tokens" notice that surfaces
 * the SDK's auto-compaction so the user knows why the context-usage badge
 * just dropped.
 */
export function CompactionNotice({ notice }: { notice: Notice | null }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!notice) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), FADE_AFTER_MS);
    return () => clearTimeout(t);
  }, [notice]);

  if (!notice || !visible) return null;

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
