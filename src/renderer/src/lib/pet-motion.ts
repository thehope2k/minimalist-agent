/** Pure physics helpers for the desktop pet's drag-release momentum. No React, no DOM — easy to reason about in isolation. */

export interface PointerSample {
  x: number;
  y: number;
  timeMs: number;
}

export interface Velocity {
  vx: number;
  vy: number;
}

/** Only samples from the last ~2 frames matter for "how fast was the flick" — older ones would blend in a pause-then-flick as a slow drag. */
const VELOCITY_SAMPLE_WINDOW_MS = 120;

/** Caps an unrealistic flick (e.g. a synthetic pointer jump) from launching the pet off-screen in one frame. */
const MAX_RELEASE_SPEED_PX_PER_SEC = 900;

export function recordPointerSample(history: PointerSample[], sample: PointerSample): PointerSample[] {
  const cutoffMs = sample.timeMs - VELOCITY_SAMPLE_WINDOW_MS;
  return [...history.filter((entry) => entry.timeMs >= cutoffMs), sample];
}

export function computeReleaseVelocity(history: PointerSample[]): Velocity {
  if (history.length < 2) return { vx: 0, vy: 0 };

  const oldest = history[0];
  const newest = history[history.length - 1];
  const elapsedSec = (newest.timeMs - oldest.timeMs) / 1000;
  if (elapsedSec <= 0) return { vx: 0, vy: 0 };

  return clampSpeed({
    vx: (newest.x - oldest.x) / elapsedSec,
    vy: (newest.y - oldest.y) / elapsedSec,
  });
}

function clampSpeed(velocity: Velocity): Velocity {
  const speed = speedOf(velocity);
  if (speed <= MAX_RELEASE_SPEED_PX_PER_SEC) return velocity;
  const scale = MAX_RELEASE_SPEED_PX_PER_SEC / speed;
  return { vx: velocity.vx * scale, vy: velocity.vy * scale };
}

export function applyFriction(velocity: Velocity, frictionRetainedPerSec: number, deltaSec: number): Velocity {
  const decay = Math.pow(frictionRetainedPerSec, deltaSec);
  return { vx: velocity.vx * decay, vy: velocity.vy * decay };
}

export function speedOf(velocity: Velocity): number {
  return Math.hypot(velocity.vx, velocity.vy);
}
