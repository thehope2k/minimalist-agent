import { useEffect, type RefObject } from 'react';

// Panel animations and sidebar toggles can move the slot without resizing
// it, which ResizeObserver doesn't report; a cheap poll catches the drift.
const POSITION_POLL_MS = 250;

/**
 * Keeps main's native page aligned with the slot element: sends the slot's
 * rect (CSS px == window DIPs) whenever it moves, resizes, freezes, or the
 * chat changes, at most once per animation frame. Unmounting hides the page.
 */
export function useSurfaceSync(
  slotRef: RefObject<HTMLElement | null>,
  sessionId: string | null,
  frozen: boolean,
) {
  useEffect(() => {
    const slot = slotRef.current;
    if (!slot) return;
    let raf = 0;
    let last = '';
    const send = () => {
      raf = 0;
      const r = slot.getBoundingClientRect();
      const surface = {
        sessionId,
        bounds: { x: r.left, y: r.top, width: r.width, height: r.height },
        visible: sessionId !== null,
        frozen,
      };
      const key = JSON.stringify(surface);
      if (key === last) return;
      last = key;
      window.api.browser.setSurface(surface);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(send);
    };
    const resize = new ResizeObserver(schedule);
    resize.observe(slot);
    window.addEventListener('resize', schedule);
    const poll = setInterval(schedule, POSITION_POLL_MS);
    schedule();
    return () => {
      if (raf) cancelAnimationFrame(raf);
      resize.disconnect();
      window.removeEventListener('resize', schedule);
      clearInterval(poll);
    };
  }, [slotRef, sessionId, frozen]);

  // Separate so a freeze/chat switch doesn't hide-then-reshow the page.
  useEffect(
    () => () =>
      window.api.browser.setSurface({
        sessionId: null,
        bounds: { x: 0, y: 0, width: 0, height: 0 },
        visible: false,
        frozen: false,
      }),
    [],
  );
}
