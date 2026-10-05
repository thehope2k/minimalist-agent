import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui';

export function ConsentBanner({
  granted,
  slug,
  onGrant,
  onRevoke,
}: {
  granted: boolean;
  slug: string;
  onGrant: () => void;
  onRevoke: () => void;
}) {
  const confirmGrant = () => {
    const accepted = window.confirm(
      `This lets the agent start ${slug}'s program the next time you chat. ` +
        `It'll be able to run code from whatever package it points to — only ` +
        `allow extensions you trust.\n\nAllow "${slug}"?`,
    );
    if (accepted) onGrant();
  };

  return (
    <div className="flex items-center gap-2 rounded-md border border-border/60 bg-elevated/40 p-2 text-xs">
      {granted ? (
        <>
          <ShieldCheck className="h-4 w-4 text-green-400" strokeWidth={1.75} />
          <span className="flex-1 text-fg-muted">
            You've allowed this extension to run its program.
          </span>
          <Button variant="ghost" size="sm" onClick={onRevoke}>
            Remove access
          </Button>
        </>
      ) : (
        <>
          <ShieldAlert className="h-4 w-4 text-amber-400" strokeWidth={1.75} />
          <span className="flex-1 text-fg-muted">
            This extension runs its own program in the background — allow it before it can start.
          </span>
          <Button variant="primary" size="sm" onClick={confirmGrant}>
            Allow
          </Button>
        </>
      )}
    </div>
  );
}
