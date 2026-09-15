import { useEffect, useRef, useState } from 'react';
import { PetPanda } from './PetPanda';
import { usePetSignal, type PetReaction, type PetBaseState } from './usePetSignal';
import { useCursorGaze } from './useCursorGaze';
import {
  clampX,
  clampY,
  DASH_SPEED_PX_PER_SEC,
  HORIZONTAL_MARGIN_PX,
  PET_HEIGHT_PX,
  PET_WIDTH_PX,
  randomDashTarget,
  randomWalkTarget,
  restingY,
  stepToward,
  useMotionLoop,
  WALK_SPEED_PX_PER_SEC,
} from './pet-position';
import { getAppSettings, setPetLastX, setPetLastY } from '@/lib/app-settings';
import { playPetSound, type PetSoundKind } from '@/lib/pet-sound';
import { applyFriction, speedOf, type Velocity } from '@/lib/pet-motion';
import { usePetDrag } from './usePetDrag';

const POSITION_SAVE_INTERVAL_MS = 3000;

/** Fraction of velocity retained after a full second of momentum decay — low value = a short, snappy flick, not an ice-rink slide. */
const MOMENTUM_FRICTION_RETAINED_PER_SEC = 0.08;
/** Below this speed a flick isn't worth animating, and momentum stops decaying toward zero forever. */
const MOMENTUM_STOP_SPEED_PX_PER_SEC = 24;
/** A release slower than this just drops the pet in place, matching the pre-momentum drag behavior. */
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

interface DesktopPetProps {
  isStreaming: boolean;
}

export function DesktopPet({ isStreaming }: DesktopPetProps) {
  const { baseState, reaction, reactionNonce, triggerClick, clearReaction } =
    usePetSignal(isStreaming);

  const [x, setX] = useState(() => clampX(getAppSettings().petLastX ?? HORIZONTAL_MARGIN_PX));
  const [y, setY] = useState(() => clampY(getAppSettings().petLastY ?? restingY()));
  const [facing, setFacing] = useState<1 | -1>(1);
  const [dashPhase, setDashPhase] = useState<'out' | 'back' | null>(null);

  const walkTargetRef = useRef(randomWalkTarget());
  const dashHomeXRef = useRef(x);
  const dashTargetXRef = useRef(x);
  const xRef = useRef(x);
  const yRef = useRef(y);
  xRef.current = x;
  yRef.current = y;

  const [momentumActive, setMomentumActive] = useState(false);
  const velocityRef = useRef<Velocity>({ vx: 0, vy: 0 });
  const pendingDashRef = useRef(false);
  const { isDragging, handlePointerDown, handlePointerMove, handlePointerUp } = usePetDrag({
    xRef,
    yRef,
    velocityRef,
    setX,
    setY,
    setMomentumActive,
    setDashPhase,
  });

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

  const gazeEnabled =
    (displayState === 'idle' || displayState === 'sit') && !isDragging && reaction === null;
  const gaze = useCursorGaze({ x: x + PET_WIDTH_PX / 2, y: y + PET_HEIGHT_PX / 2 }, gazeEnabled);
  const localGaze = { x: gaze.x * facing, y: gaze.y };

  useMotionLoop(
    baseState === 'walk' && !dashPhase && !isDragging && !momentumActive,
    (deltaSec) => {
      setX((current) => {
        const { next, arrived } = stepToward(
          current,
          walkTargetRef.current,
          WALK_SPEED_PX_PER_SEC,
          deltaSec,
        );
        setFacing(walkTargetRef.current > current ? 1 : -1);
        if (arrived) walkTargetRef.current = randomWalkTarget();
        return next;
      });
    },
  );

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
    const nextVelocity = applyFriction(
      velocityRef.current,
      MOMENTUM_FRICTION_RETAINED_PER_SEC,
      deltaSec,
    );
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
