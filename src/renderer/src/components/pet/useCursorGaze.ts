import { useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

export interface Point {
  x: number;
  y: number;
}

/** Cursor further than this from the pet's center doesn't pull its gaze at all. */
const GAZE_TRACKING_RADIUS_PX = 160;

/** Eyes are tiny (a few px across) — this is close to the physical limit of how far the pupil can shift and still read as "inside the eye". */
const GAZE_MAX_OFFSET_PX = 1.2;

function computeGazeOffset(petCenter: Point, cursor: Point): Point {
  const dx = cursor.x - petCenter.x;
  const dy = cursor.y - petCenter.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0 || distance > GAZE_TRACKING_RADIUS_PX) return { x: 0, y: 0 };

  const pull = (1 - distance / GAZE_TRACKING_RADIUS_PX) * GAZE_MAX_OFFSET_PX;
  return { x: (dx / distance) * pull, y: (dy / distance) * pull };
}

/** Subtle "the pet notices you" touch: eyes drift toward a nearby cursor while idle, and rest otherwise. Purely decorative — reads no app state. */
export function useCursorGaze(petCenter: Point, enabled: boolean): Point {
  const [gaze, setGaze] = useState<Point>({ x: 0, y: 0 });
  const petCenterRef = useRef(petCenter);
  petCenterRef.current = petCenter;
  const prefersReducedMotion = usePrefersReducedMotion();
  const trackingEnabled = enabled && !prefersReducedMotion;

  useEffect(() => {
    if (!trackingEnabled) {
      setGaze({ x: 0, y: 0 });
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      setGaze(computeGazeOffset(petCenterRef.current, { x: event.clientX, y: event.clientY }));
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [trackingEnabled]);

  return gaze;
}
