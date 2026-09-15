import {
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type PointerEvent,
  type SetStateAction,
} from 'react';
import { setPetLastX, setPetLastY } from '@/lib/app-settings';
import {
  computeReleaseVelocity,
  recordPointerSample,
  speedOf,
  type PointerSample,
  type Velocity,
} from '@/lib/pet-motion';
import { clampX, clampY } from './pet-position';

const CLICK_DRAG_THRESHOLD_PX = 6;
const MIN_FLICK_SPEED_PX_PER_SEC = 60;

interface UsePetDragOptions {
  xRef: MutableRefObject<number>;
  yRef: MutableRefObject<number>;
  velocityRef: MutableRefObject<Velocity>;
  setX: Dispatch<SetStateAction<number>>;
  setY: Dispatch<SetStateAction<number>>;
  setMomentumActive: Dispatch<SetStateAction<boolean>>;
  setDashPhase: Dispatch<SetStateAction<'out' | 'back' | null>>;
}

export function usePetDrag({
  xRef,
  yRef,
  velocityRef,
  setX,
  setY,
  setMomentumActive,
  setDashPhase,
}: UsePetDragOptions) {
  const [isDragging, setIsDragging] = useState(false);
  const pointerOffsetRef = useRef({ dx: 0, dy: 0 });
  const startClientRef = useRef({ x: 0, y: 0 });
  const draggedBeyondThresholdRef = useRef(false);
  const pointerHistoryRef = useRef<PointerSample[]>([]);

  const handlePointerDown = (event: PointerEvent) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerOffsetRef.current = {
      dx: event.clientX - xRef.current,
      dy: event.clientY - yRef.current,
    };
    startClientRef.current = { x: event.clientX, y: event.clientY };
    draggedBeyondThresholdRef.current = false;
    pointerHistoryRef.current = [{ x: event.clientX, y: event.clientY, timeMs: performance.now() }];
    setMomentumActive(false);
    setDashPhase(null);
    setIsDragging(true);
  };

  const handlePointerMove = (event: PointerEvent) => {
    if (!isDragging) return;
    const movedX = event.clientX - startClientRef.current.x;
    const movedY = event.clientY - startClientRef.current.y;
    if (Math.hypot(movedX, movedY) > CLICK_DRAG_THRESHOLD_PX) {
      draggedBeyondThresholdRef.current = true;
    }
    pointerHistoryRef.current = recordPointerSample(pointerHistoryRef.current, {
      x: event.clientX,
      y: event.clientY,
      timeMs: performance.now(),
    });
    setX(clampX(event.clientX - pointerOffsetRef.current.dx));
    setY(clampY(event.clientY - pointerOffsetRef.current.dy));
  };

  const handlePointerUp = (event: PointerEvent) => {
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

  return { isDragging, handlePointerDown, handlePointerMove, handlePointerUp };
}
