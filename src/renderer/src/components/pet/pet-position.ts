import { useEffect, useRef } from 'react';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

export const WALK_SPEED_PX_PER_SEC = 40;
export const DASH_SPEED_PX_PER_SEC = 140;
export const DASH_DISTANCE_PX = 55;
export const HORIZONTAL_MARGIN_PX = 40;
export const VERTICAL_MARGIN_PX = 24;
export const PET_WIDTH_PX = 72;
export const PET_HEIGHT_PX = 44;
export const POSITION_EPSILON_PX = 2;

export function clampX(x: number): number {
  const maxX = window.innerWidth - HORIZONTAL_MARGIN_PX - PET_WIDTH_PX;
  return Math.min(Math.max(x, HORIZONTAL_MARGIN_PX), Math.max(HORIZONTAL_MARGIN_PX, maxX));
}

export function clampY(y: number): number {
  const maxY = window.innerHeight - VERTICAL_MARGIN_PX - PET_HEIGHT_PX;
  return Math.min(Math.max(y, VERTICAL_MARGIN_PX), Math.max(VERTICAL_MARGIN_PX, maxY));
}

export function restingY(): number {
  return window.innerHeight - VERTICAL_MARGIN_PX - PET_HEIGHT_PX;
}

export function randomWalkTarget(): number {
  const maxX = window.innerWidth - HORIZONTAL_MARGIN_PX - PET_WIDTH_PX;
  return HORIZONTAL_MARGIN_PX + Math.random() * Math.max(0, maxX - HORIZONTAL_MARGIN_PX);
}

export function randomDashTarget(fromX: number): number {
  const direction = Math.random() < 0.5 ? 1 : -1;
  return clampX(fromX + direction * DASH_DISTANCE_PX);
}

export function stepToward(
  current: number,
  target: number,
  speedPxPerSec: number,
  deltaSec: number,
): { next: number; arrived: boolean } {
  const direction = target > current ? 1 : -1;
  const next = current + direction * speedPxPerSec * deltaSec;
  const arrived = Math.abs(target - next) < POSITION_EPSILON_PX;
  return { next: arrived ? target : next, arrived };
}

export function useMotionLoop(active: boolean, onStep: (deltaSec: number) => void): void {
  const onStepRef = useRef(onStep);
  onStepRef.current = onStep;
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (!active) return;

    let animationFrameId: number;
    let lastTimestamp: number | null = null;
    const frame = (timestamp: number) => {
      animationFrameId = requestAnimationFrame(frame);
      if (document.hidden || prefersReducedMotion) {
        lastTimestamp = null;
        return;
      }
      if (lastTimestamp === null) {
        lastTimestamp = timestamp;
        return;
      }
      const deltaSec = (timestamp - lastTimestamp) / 1000;
      lastTimestamp = timestamp;
      onStepRef.current(deltaSec);
    };

    animationFrameId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animationFrameId);
  }, [active, prefersReducedMotion]);
}
