import { useEffect, useRef, useState } from 'react';
import { PetPanda } from './PetPanda';
import { usePetSignal, type PetReaction, type PetBaseState } from './usePetSignal';
import { getAppSettings, setPetLastX, setPetLastY } from '@/lib/app-settings';
import { playPetSound, type PetSoundKind } from '@/lib/pet-sound';

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

const REACTION_DURATION_MS: Record<Exclude<PetReaction, null>, number> = {
  greet: 1200,
  click: 650,
  'streaming-start': 700,
  'streaming-end': 600,
  'tool-start': 1000,
  'tool-error': 500,
  'commit-success': 800,
};

const REACTION_SOUND: Record<Exclude<PetReaction, null>, PetSoundKind> = {
  greet: 'happy',
  click: 'click',
  'streaming-start': 'tool',
  'streaming-end': 'happy',
  'tool-start': 'tool',
  'tool-error': 'error',
  'commit-success': 'happy',
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

  useEffect(() => {
    if (!active) return;

    let animationFrameId: number;
    let lastTimestamp: number | null = null;
    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let prefersReducedMotion = reducedMotionQuery.matches;
    const onReducedMotionChange = (event: MediaQueryListEvent) => {
      prefersReducedMotion = event.matches;
    };
    reducedMotionQuery.addEventListener('change', onReducedMotionChange);

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
    return () => {
      cancelAnimationFrame(animationFrameId);
      reducedMotionQuery.removeEventListener('change', onReducedMotionChange);
    };
  }, [active]);
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

  useEffect(() => {
    if (!reaction) return;
    if (getAppSettings().petSoundEnabled) playPetSound(REACTION_SOUND[reaction]);
    const timeoutId = setTimeout(clearReaction, REACTION_DURATION_MS[reaction]);
    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reactionNonce]);

  useEffect(() => {
    if (!reaction || !DASH_TRIGGERS.has(reaction) || isDragging) return;
    dashHomeXRef.current = xRef.current;
    dashTargetXRef.current = randomDashTarget(xRef.current);
    setDashPhase('out');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reactionNonce]);

  const displayState: PetBaseState = dashPhase ? 'walk' : baseState;

  useMotionLoop(baseState === 'walk' && !dashPhase && !isDragging, (deltaSec) => {
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
    setX(clampX(event.clientX - dragPointerOffsetRef.current.dx));
    setY(clampY(event.clientY - dragPointerOffsetRef.current.dy));
  };

  const handlePointerUp = (event: React.PointerEvent) => {
    setIsDragging(false);
    if (draggedBeyondThresholdRef.current) {
      event.preventDefault();
      setPetLastX(xRef.current);
      setPetLastY(yRef.current);
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
          onClick={triggerClick}
        />
      </div>
    </div>
  );
}
