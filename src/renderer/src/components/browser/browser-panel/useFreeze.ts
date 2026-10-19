import { useEffect, useState, type RefObject } from 'react';
import { freezeReason, type FreezeReason } from './overlay';

/** Re-evaluates `freezeReason` whenever the DOM, window, or slot changes. */
export function useFreeze(slotRef: RefObject<HTMLElement | null>): FreezeReason {
  const [reason, setReason] = useState<FreezeReason>(null);

  useEffect(() => {
    const slot = slotRef.current;
    if (!slot) return;
    let raf = 0;
    const evaluate = () => {
      raf = 0;
      setReason(freezeReason(slot, document));
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(evaluate);
    };
    // Style changes are left out on purpose: they fire constantly during
    // animations, and every overlay that matters also adds nodes or flips
    // a state attribute when it opens.
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-separator', 'data-state', 'class', 'hidden', 'open'],
    });
    const resize = new ResizeObserver(schedule);
    resize.observe(slot);
    window.addEventListener('resize', schedule);
    schedule();
    return () => {
      if (raf) cancelAnimationFrame(raf);
      observer.disconnect();
      resize.disconnect();
      window.removeEventListener('resize', schedule);
    };
  }, [slotRef]);

  return reason;
}
