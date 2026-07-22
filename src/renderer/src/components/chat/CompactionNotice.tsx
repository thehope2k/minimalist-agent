import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { CompactionNotice as Notice } from '@/hooks/useChat';

const RUNNING_LABEL: Record<Notice['trigger'], string> = {
  overflow: 'Recovering from context overflow…',
  manual: 'Compacting…',
  threshold: 'Compacting older messages…',
  auto: 'Compacting older messages…',
};

/** Only the running phase renders — success/failed already get a persistent,
 *  expandable marker in the message list (CompactionDivider), so a fading
 *  toast for those would just repeat it. */
export function CompactionNotice({ notice }: { notice: Notice | null }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(notice?.status === 'running');
  }, [notice]);

  if (!visible || notice?.status !== 'running') return null;

  return (
    <div className="mx-auto mb-2 flex w-fit items-center gap-2 rounded-md border border-amber-500/50 bg-amber-500/15 px-3 py-1.5 text-sm font-medium text-amber-300 shadow-sm animate-pulse">
      <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
      <span>{RUNNING_LABEL[notice.trigger]}</span>
    </div>
  );
}
