import { Button } from '@/components/ui';

interface RestoreBannerProps {
  restoreCandidate: boolean;
  info: string | null;
  onRestore: () => void;
  onStartFresh: () => void;
}

export function RestoreBanner({ restoreCandidate, info, onRestore, onStartFresh }: RestoreBannerProps) {
  if (!restoreCandidate && !info) return null;

  return (
    <div className="border-b border-border/60 bg-elevated/30 px-3 py-2">
      <p className="text-[11px] text-fg-muted">
        {restoreCandidate
          ? 'Previous review state found for this workspace. Restore it?'
          : info}
      </p>
      {restoreCandidate && (
        <div className="mt-2 flex items-center gap-2">
          <Button size="sm" variant="primary" onClick={onRestore}>Restore</Button>
          <Button size="sm" variant="ghost" onClick={onStartFresh}>Start fresh</Button>
        </div>
      )}
    </div>
  );
}
