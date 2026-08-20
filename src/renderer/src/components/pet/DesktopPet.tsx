import { useEffect, useRef, useState } from 'react';
import { PetPanda } from './PetPanda';
import { usePetSignal, type PetReaction, type PetBaseState } from './usePetSignal';
import { useCursorGaze } from './useCursorGaze';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';
import { getAppSettings, setPetLastX, setPetLastY } from '@/lib/app-settings';
import { playPetSound, type PetSoundKind } from '@/lib/pet-sound';
import {
  applyFriction,
  computeReleaseVelocity,
  recordPointerSample,
  speedOf,
  type PointerSample,
  type Velocity,
} from '@/lib/pet-motion';

const WALK_SPEED_PX_PER_SEC = 40;
const DASH_SPEED_PX_PER_SEC = 140;
const DASH_DISTANCE_PX = 55;
const HORIZONTAL_MARGIN_PX = 40;
const VERTICAL_MARGIN_PX = 24;
const PET_WIDTH_PX = 72;
const PET_HEIGHT_PX = 44;
const POSITION_EPSILON_PX = 2;
const POSITION_SAVE_INTERVAL_MS = 3000;
const CLICK_DRAG_THRESHOLD_PX = 6;

/** Fraction of velocity retained after a full second of momentum decay — low value = a short, snappy flick, not an ice-rink slide. */
const MOMENTUM_FRICTION_RETAINED_PER_SEC = 0.08;
/** Below this speed a flick isn't worth animating, and momentum stops decaying toward zero forever. */
const MOMENTUM_STOP_SPEED_PX_PER_SEC = 24;
/** A release slower than this just drops the pet in place, matching the pre-momentum drag behavior. */
const MIN_FLICK_SPEED_PX_PER_SEC = 60;
const FACING_FLIP_VELOCITY_THRESHOLD_PX_PER_SEC = 8;

const REACTION_DURATION_MS: Record<Exclude<PetReaction, null>, number> = {
  greet: 1200,
  click: 650,
  'streaming-start': 700,
  'streaming-end': 600,
  'tool-start': 1000,
  'tool-error': 500,
  'commit-success': 800,
  fidget: 1400,
};

const REACTION_SOUND: Partial<Record<Exclude<PetReaction, null>, PetSoundKind>> = {
  greet: 'happy',
  click: 'click',
  'streaming-start': 'tool',
  'streaming-end': 'happy',
  'tool-start': 'tool',
  'tool-error': 'error',
  'commit-success': 'happy',
  // 'fidget' intentionally has no sound — it's a rare idle flourish, not an event worth chiming for.
};

const DASH_TRIGGERS: ReadonlySet<PetReaction> = new Set(['tool-start', 'commit-success']);

function clampX(x: number): number {
  const maxX = window.innerWidth - HORIZONTAL_MARGIN_PX - PET_WIDTH_PX;
  return Math.min(Math.max(x, HORIZONTAL_MARGIN_PX), Math.max(HORIZONTAL_MARGIN_PX, maxX));
}

function clampY(y: number): number {
  const maxY = window.innerHeight - VERTICAL_MARGIN_PX - PET_HEIGHT_PX;
  return Math.min(Math.max(y, VERTICAL_MARGIN_PX), Math.max(VERTICAL_MARGIN_PX, maxY));
}

function restingY(): number {
  return window.innerHeight - VERTICAL_MARGIN_PX - PET_HEIGHT_PX;
}

function randomWalkTarget(): number {
  const maxX = window.innerWidth - HORIZONTAL_MARGIN_PX - PET_WIDTH_PX;
  return HORIZONTAL_MARGIN_PX + Math.random() * Math.max(0, maxX - HORIZONTAL_MARGIN_PX);
}

function randomDashTarget(fromX: number): number {
  const direction = Math.random() < 0.5 ? 1 : -1;
  return clampX(fromX + direction * DASH_DISTANCE_PX);
}

function stepToward(
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

function useMotionLoop(active: boolean, onStep: (deltaSec: number) => void): void {
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

interface DesktopPetProps {
  isStreaming: boolean;
}

export function DesktopPet({ isStreaming }: DesktopPetProps) {
  const { baseState, reaction, reactionNonce, triggerClick, clearReaction } = usePetSignal(isStreaming);

  const [x, setX] = useState(() => clampX(getAppSettings().petLastX ?? HORIZONTAL_MARGIN_PX));
  const [y, setY] = useState(() => clampY(getAppSettings().petLastY ?? restingY()));
  const [facing, setFacing] = useState<1 | -1>(1);
  const [dashPhase, setDashPhase] = useState<'out' | 'back' | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const walkTargetRef = useRef(randomWalkTarget());
  const dashHomeXRef = useRef(x);
  const dashTargetXRef = useRef(x);
  const xRef = useRef(x);
  const yRef = useRef(y);
  xRef.current = x;
  yRef.current = y;

  const dragPointerOffsetRef = useRef({ dx: 0, dy: 0 });
  const dragStartClientRef = useRef({ x: 0, y: 0 });
  const draggedBeyondThresholdRef = useRef(false);
  const pointerHistoryRef = useRef<PointerSample[]>([]);

  const [momentumActive, setMomentumActive] = useState(false);
  const velocityRef = useRef<Velocity>({ vx: 0, vy: 0 });
  const pendingDashRef = useRef(false);

  const startDash = () => {
    dashHomeXRef.current = xRef.current;
    dashTargetXRef.current = randomDashTarget(xRef.current);
    setDashPhase('out');
  };

  useEffect(() => {
    if (!reaction) return;
    const sound = REACTION_SOUND[reaction];
    if (sound && getAppSettings().petSoundEnabled) playPetSound(sound);
    const timeoutId = setTimeout(clearReaction, REACTION_DURATION_MS[reaction]);
    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reactionNonce]);

  useEffect(() => {
    if (!reaction || !DASH_TRIGGERS.has(reaction) || isDragging) return;
    if (momentumActive) {
      // Dashing now would fight the momentum motion loop for the same x/y state — defer it instead
      // of dropping it; the momentum-end effect below fires it once the coast settles.
      pendingDashRef.current = true;
      return;
    }
    startDash();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reactionNonce]);

  // Fires a dash that was deferred because momentum (or a re-grab) was in the way when it was triggered.
  useEffect(() => {
    if (momentumActive || isDragging || !pendingDashRef.current) return;
    pendingDashRef.current = false;
    startDash();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [momentumActive, isDragging]);

  const displayState: PetBaseState = dashPhase || momentumActive ? 'walk' : baseState;

  const gazeEnabled = (displayState === 'idle' || displayState === 'sit') && !isDragging && reaction === null;
  const gaze = useCursorGaze({ x: x + PET_WIDTH_PX / 2, y: y + PET_HEIGHT_PX / 2 }, gazeEnabled);
  const localGaze = { x: gaze.x * facing, y: gaze.y };

  useMotionLoop(baseState === 'walk' && !dashPhase && !isDragging && !momentumActive, (deltaSec) => {
    setX((current) => {
      const { next, arrived } = stepToward(current, walkTargetRef.current, WALK_SPEED_PX_PER_SEC, deltaSec);
      setFacing(walkTargetRef.current > current ? 1 : -1);
      if (arrived) walkTargetRef.current = randomWalkTarget();
      return next;
    });
  });

  useMotionLoop(dashPhase !== null && !isDragging, (deltaSec) => {
    const target = dashPhase === 'out' ? dashTargetXRef.current : dashHomeXRef.current;
    setX((current) => {
      const { next, arrived } = stepToward(current, target, DASH_SPEED_PX_PER_SEC, deltaSec);
      setFacing(target > current ? 1 : -1);
      if (arrived) setDashPhase((phase) => (phase === 'out' ? 'back' : null));
      return next;
    });
  });

  useMotionLoop(momentumActive, (deltaSec) => {
    const nextVelocity = applyFriction(velocityRef.current, MOMENTUM_FRICTION_RETAINED_PER_SEC, deltaSec);
    velocityRef.current = nextVelocity;

    if (Math.abs(nextVelocity.vx) > FACING_FLIP_VELOCITY_THRESHOLD_PX_PER_SEC) {
      setFacing(nextVelocity.vx > 0 ? 1 : -1);
    }
    setX((current) => clampX(current + nextVelocity.vx * deltaSec));
    setY((current) => clampY(current + nextVelocity.vy * deltaSec));

    if (speedOf(nextVelocity) < MOMENTUM_STOP_SPEED_PX_PER_SEC) setMomentumActive(false);
  });

  useEffect(() => {
    const handleResize = () => {
      setX((current) => clampX(current));
      setY((current) => clampY(current));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const lastSaved = { x: xRef.current, y: yRef.current };
    const intervalId = setInterval(() => {
      if (xRef.current === lastSaved.x && yRef.current === lastSaved.y) return;
      lastSaved.x = xRef.current;
      lastSaved.y = yRef.current;
      setPetLastX(xRef.current);
      setPetLastY(yRef.current);
    }, POSITION_SAVE_INTERVAL_MS);
    return () => {
      clearInterval(intervalId);
      setPetLastX(xRef.current);
      setPetLastY(yRef.current);
    };
  }, []);

  const handlePointerDown = (event: React.PointerEvent) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragPointerOffsetRef.current = { dx: event.clientX - xRef.current, dy: event.clientY - yRef.current };
    dragStartClientRef.current = { x: event.clientX, y: event.clientY };
    draggedBeyondThresholdRef.current = false;
    pointerHistoryRef.current = [{ x: event.clientX, y: event.clientY, timeMs: performance.now() }];
    setMomentumActive(false);
    setDashPhase(null);
    setIsDragging(true);
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    if (!isDragging) return;
    const movedX = event.clientX - dragStartClientRef.current.x;
    const movedY = event.clientY - dragStartClientRef.current.y;
    if (Math.hypot(movedX, movedY) > CLICK_DRAG_THRESHOLD_PX) {
      draggedBeyondThresholdRef.current = true;
    }
    pointerHistoryRef.current = recordPointerSample(pointerHistoryRef.current, {
      x: event.clientX,
      y: event.clientY,
      timeMs: performance.now(),
    });
    setX(clampX(event.clientX - dragPointerOffsetRef.current.dx));
    setY(clampY(event.clientY - dragPointerOffsetRef.current.dy));
  };

  const handlePointerUp = (event: React.PointerEvent) => {
    setIsDragging(false);
    if (!draggedBeyondThresholdRef.current) return;

    event.preventDefault();
    setPetLastX(xRef.current);
    setPetLastY(yRef.current);

    const releaseVelocity = computeReleaseVelocity(pointerHistoryRef.current);
    if (speedOf(releaseVelocity) >= MIN_FLICK_SPEED_PX_PER_SEC) {
      velocityRef.current = releaseVelocity;
      setMomentumActive(true);
    }
  };

  return (
    <div
      className="pointer-events-none fixed top-0 left-0 z-50"
      style={{ transform: `translate(${x}px, ${y}px) scaleX(${facing})` }}
    >
      <div
        className="pointer-events-auto"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <PetPanda
          baseState={displayState}
          isStreaming={isStreaming}
          reaction={reaction}
          reactionNonce={reactionNonce}
          gaze={localGaze}
          onClick={triggerClick}
        />
      </div>
    </div>
  );
}
