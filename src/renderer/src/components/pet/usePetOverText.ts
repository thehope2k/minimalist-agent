import { useEffect, useState, type RefObject } from 'react';
import { PET_HEIGHT_PX, PET_WIDTH_PX } from './pet-position';

const CHECK_INTERVAL_MS = 250;
const AVOID_SELECTOR = '[data-pet-avoid]';

/** True while any part of the pet sits over reading content (chat, file viewer).
 *  Polled rather than per-frame: the pet walks continuously and a quarter-second
 *  lag on the fade is invisible. */
export function usePetOverText(
  xRef: RefObject<number>,
  yRef: RefObject<number>,
  enabled: boolean,
): boolean {
  const [overText, setOverText] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setOverText(false);
      return;
    }
    const check = () => {
      const x = xRef.current;
      const y = yRef.current + PET_HEIGHT_PX / 2;
      const samples = [x + 8, x + PET_WIDTH_PX / 2, x + PET_WIDTH_PX - 8];
      const hit = samples.some((sx) =>
        document.elementsFromPoint(sx, y).some((el) => el.closest(AVOID_SELECTOR)),
      );
      setOverText(hit);
    };
    check();
    const intervalId = setInterval(check, CHECK_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [xRef, yRef, enabled]);

  return overText;
}
