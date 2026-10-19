import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { ActivityBar } from './browser-panel/ActivityBar';
import { Chrome } from './browser-panel/Chrome';
import { PoppedOut } from './browser-panel/PoppedOut';
import { EmptyState } from './browser-panel/EmptyState';
import { useFreeze } from './browser-panel/useFreeze';
import { useSurfaceSync } from './browser-panel/useSurfaceSync';
import { useBrowserState } from './useBrowserState';

type Props = {
  sessionId: string | null;
  onHidePanel: () => void;
};

/**
 * The right side panel's browser: HTML chrome on top, and a slot that main
 * fills with the chat's native page (see docs/BROWSER-PANE.md). While HTML
 * overlays the slot, a still image of the page stands in for it.
 */
export function BrowserPanel({ sessionId, onHidePanel }: Props) {
  const state = useBrowserState(sessionId);
  const slotRef = useRef<HTMLDivElement>(null);
  const hasPage = !!sessionId && !!state?.open;
  const poppedOut = hasPage && !!state?.poppedOut;
  const activity = hasPage && state?.agentControl ? state.activity : null;
  const freezeReason = useFreeze(slotRef);
  const { frozen, image } = useFreezeImage(hasPage ? sessionId : null, freezeReason);

  useSurfaceSync(slotRef, hasPage ? sessionId : null, frozen);

  return (
    <div className="flex h-full flex-col">
      {hasPage && state && <Chrome sessionId={sessionId} state={state} onHidePanel={onHidePanel} />}
      {/* The native page covers its slot completely, so the "agent is acting"
          highlight is a constant 2px frame around it — constant so the page's
          viewport doesn't change size whenever the agent starts or stops. */}
      <div className={cn('flex min-h-0 flex-1 p-0.5 transition-colors', activity && 'bg-accent')}>
        <div
          ref={slotRef}
          className={cn(
            'relative min-h-0 flex-1 overflow-hidden',
            hasPage && !poppedOut && 'bg-white',
          )}
        >
          {!hasPage && <EmptyState sessionId={sessionId} onHidePanel={onHidePanel} />}
          {poppedOut && sessionId && <PoppedOut sessionId={sessionId} />}
          {hasPage && !poppedOut && image && (
            <img
              src={image}
              alt=""
              draggable={false}
              className="h-full w-full object-cover object-left-top"
            />
          )}
        </div>
      </div>
      {activity && sessionId && <ActivityBar sessionId={sessionId} activity={activity} />}
    </div>
  );
}

/**
 * Overlay freezes wait for the image so nothing flickers; drag freezes
 * apply at once, since the native page would otherwise swallow the drag.
 */
function useFreezeImage(sessionId: string | null, reason: 'drag' | 'overlay' | null) {
  const [frozen, setFrozen] = useState(false);
  const [image, setImage] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId || !reason) {
      setFrozen(false);
      // Keep the image one frame longer so the re-docked page paints first.
      const raf = requestAnimationFrame(() => setImage(null));
      return () => cancelAnimationFrame(raf);
    }
    let alive = true;
    if (reason === 'drag') setFrozen(true);
    void window.api.browser.freezeImage(sessionId).then((img) => {
      if (!alive) return;
      setImage(img);
      setFrozen(true);
    });
    return () => {
      alive = false;
    };
  }, [sessionId, reason]);

  return { frozen, image };
}
