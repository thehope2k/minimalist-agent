import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribePetEvent } from '@/lib/pet-events';

export type PetBaseState = 'idle' | 'walk' | 'sit' | 'nap';
export type PetReaction =
  | 'greet'
  | 'click'
  | 'streaming-start'
  | 'streaming-end'
  | 'tool-start'
  | 'tool-error'
  | 'commit-success'
  | 'fidget'
  | null;

export interface PetSignalState {
  baseState: PetBaseState;
  isStreaming: boolean;
  reaction: PetReaction;
  reactionNonce: number;
  triggerClick: () => void;
  clearReaction: () => void;
}

const IDLE_WANDER_BASE_MS = 90_000;
const LONG_IDLE_NAP_BASE_MS = 5 * 60_000;
const WANDER_TICK_INTERVAL_MS = 8_000;

// Idle timing is randomized per idle stretch (see `resetActivityClock`) so wander/nap don't land on a
// visible metronome — a fixed threshold reads as a state machine, a jittered one reads as a creature.
const IDLE_WANDER_JITTER_RATIO = 0.35;
const LONG_IDLE_NAP_JITTER_RATIO = 0.2;

/** Chance, each wander-tick spent resting in `idle`/`sit`, that the pet plays a one-off stretch/fidget. */
const FIDGET_TRIGGER_PROBABILITY = 0.05;

function rollJitteredThreshold(baseMs: number, jitterRatio: number): number {
  const jitterRangeMs = baseMs * jitterRatio;
  return baseMs + (Math.random() * 2 - 1) * jitterRangeMs;
}

export function usePetSignal(isStreaming: boolean): PetSignalState {
  const [baseState, setBaseState] = useState<PetBaseState>('idle');
  const [reaction, setReaction] = useState<PetReaction>('greet');
  const [reactionNonce, setReactionNonce] = useState(0);
  const lastActivityRef = useRef(Date.now());
  const wasStreamingRef = useRef(isStreaming);
  const wanderThresholdMsRef = useRef(rollJitteredThreshold(IDLE_WANDER_BASE_MS, IDLE_WANDER_JITTER_RATIO));
  const napThresholdMsRef = useRef(rollJitteredThreshold(LONG_IDLE_NAP_BASE_MS, LONG_IDLE_NAP_JITTER_RATIO));

  const resetActivityClock = useCallback(() => {
    lastActivityRef.current = Date.now();
    wanderThresholdMsRef.current = rollJitteredThreshold(IDLE_WANDER_BASE_MS, IDLE_WANDER_JITTER_RATIO);
    napThresholdMsRef.current = rollJitteredThreshold(LONG_IDLE_NAP_BASE_MS, LONG_IDLE_NAP_JITTER_RATIO);
  }, []);

  const fireReaction = useCallback(
    (next: Exclude<PetReaction, null>, options?: { countsAsActivity?: boolean }) => {
      // Fidgets are a cosmetic aside, not user/app activity — counting them would let the pet
      // keep resetting its own idle clock and never reach wander/nap.
      if (options?.countsAsActivity ?? true) resetActivityClock();
      setReaction(next);
      setReactionNonce((n) => n + 1);
    },
    [resetActivityClock],
  );

  const clearReaction = useCallback(() => setReaction(null), []);
  const triggerClick = useCallback(() => fireReaction('click'), [fireReaction]);

  // Read inside the tick without making `reaction` an effect dependency — the wander/nap interval
  // shouldn't tear down and restart on every reaction (click, tool events, streaming, fidget itself).
  const reactionRef = useRef(reaction);
  reactionRef.current = reaction;

  useEffect(() => {
    const wasStreaming = wasStreamingRef.current;
    wasStreamingRef.current = isStreaming;
    resetActivityClock();

    if (!wasStreaming && isStreaming) {
      fireReaction('streaming-start');
      setBaseState('idle');
    } else if (wasStreaming && !isStreaming) {
      fireReaction('streaming-end');
    }
  }, [isStreaming, fireReaction, resetActivityClock]);

  useEffect(() => {
    window.addEventListener('pointerdown', resetActivityClock);
    window.addEventListener('keydown', resetActivityClock);
    return () => {
      window.removeEventListener('pointerdown', resetActivityClock);
      window.removeEventListener('keydown', resetActivityClock);
    };
  }, [resetActivityClock]);

  useEffect(() => {
    const unsubscribers = [
      subscribePetEvent('tool-start', () => fireReaction('tool-start')),
      subscribePetEvent('tool-error', () => fireReaction('tool-error')),
      subscribePetEvent('commit-success', () => fireReaction('commit-success')),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [fireReaction]);

  useEffect(() => {
    const tick = () => {
      if (isStreaming) return;
      const idleDurationMs = Date.now() - lastActivityRef.current;

      if (idleDurationMs >= napThresholdMsRef.current) {
        setBaseState('nap');
        return;
      }
      if (baseState === 'nap') {
        setBaseState('idle');
        return;
      }
      if (idleDurationMs >= wanderThresholdMsRef.current) {
        setBaseState((prev) => (prev === 'walk' ? 'sit' : 'walk'));
        return;
      }

      setBaseState('idle');
      const canFidget = (baseState === 'idle' || baseState === 'sit') && reactionRef.current === null;
      if (canFidget && Math.random() < FIDGET_TRIGGER_PROBABILITY) {
        fireReaction('fidget', { countsAsActivity: false });
      }
    };
    const intervalId = setInterval(tick, WANDER_TICK_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [baseState, isStreaming, fireReaction]);

  return { baseState, isStreaming, reaction, reactionNonce, triggerClick, clearReaction };
}
