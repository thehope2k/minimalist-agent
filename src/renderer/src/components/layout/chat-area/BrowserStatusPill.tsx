import { useEffect, useState } from 'react';
import { Bot, Globe, User, Maximize2, XCircle } from 'lucide-react';
import { IconButton } from '@/components/ui';
import type { BrowserPaneState } from '@/lib/electron';

type Props = {
  sessionId: string | null;
};

export function BrowserStatusPill({ sessionId }: Props) {
  const [state, setState] = useState<BrowserPaneState | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setState(null);
      return;
    }
    // Both the initial fetch and later push events resolve/fire on their own
    // schedule — if a push arrives before getState()'s promise resolves, the
    // stale getState() result must not clobber it ("last write wins" would
    // otherwise pick the wrong one). One effect + a local flag keeps push
    // events authoritative over the initial fetch once either has landed.
    let receivedPush = false;
    window.api.browser.getState(sessionId).then((s) => {
      if (!receivedPush) setState(s);
    });
    return window.api.browser.onStateChanged((next) => {
      if (next.sessionId !== sessionId) return;
      receivedPush = true;
      setState(next);
    });
  }, [sessionId]);

  if (!sessionId || !state?.open) return null;

  return (
    <div className="flex items-center gap-1 rounded-md border border-border bg-elevated pl-2 pr-0.5 text-xs text-fg-muted">
      <Globe className="h-3.5 w-3.5 shrink-0 text-accent" />
      <span className="max-w-32 truncate" title={state.url}>
        {state.title || state.url || 'Browser'}
      </span>
      <IconButton
        icon={Maximize2}
        label="Show browser window"
        onClick={() => sessionId && window.api.browser.focus(sessionId)}
      />
      {state.agentControl ? (
        <IconButton
          icon={Bot}
          label="Agent is in control — click to release"
          onClick={() => sessionId && window.api.browser.release(sessionId)}
        />
      ) : (
        <span className="grid h-7 w-7 place-items-center" title="You have control">
          <User className="h-4 w-4 text-fg-subtle" strokeWidth={1.75} />
        </span>
      )}
      <IconButton
        icon={XCircle}
        label="Close browser window"
        onClick={() => sessionId && window.api.browser.close(sessionId)}
      />
    </div>
  );
}
