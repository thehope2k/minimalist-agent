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
  | null;

export interface PetSignalState {
  baseState: PetBaseState;
  isStreaming: boolean;
  reaction: PetReaction;
  reactionNonce: number;
  triggerClick: () => void;
  clearReaction: () => void;
}

const IDLE_WANDER_TIMEOUT_MS = 90_000;
const LONG_IDLE_NAP_TIMEOUT_MS = 5 * 60_000;
const WANDER_TICK_INTERVAL_MS = 8_000;

export function usePetSignal(isStreaming: boolean): PetSignalState {
  const [baseState, setBaseState] = useState<PetBaseState>('idle');
  const [reaction, setReaction] = useState<PetReaction>('greet');
  const [reactionNonce, setReactionNonce] = useState(0);
  const lastActivityRef = useRef(Date.now());
  const wasStreamingRef = useRef(isStreaming);

  const fireReaction = useCallback((next: Exclude<PetReaction, null>) => {
    lastActivityRef.current = Date.now();
    setReaction(next);
    setReactionNonce((n) => n + 1);
  }, []);

  const clearReaction = useCallback(() => setReaction(null), []);
  const triggerClick = useCallback(() => fireReaction('click'), [fireReaction]);

  useEffect(() => {
    const wasStreaming = wasStreamingRef.current;
    wasStreamingRef.current = isStreaming;
    lastActivityRef.current = Date.now();

    if (!wasStreaming && isStreaming) {
      fireReaction('streaming-start');
      setBaseState('idle');
    } else if (wasStreaming && !isStreaming) {
      fireReaction('streaming-end');
    }
  }, [isStreaming, fireReaction]);

  useEffect(() => {
    const markActivity = () => {
      lastActivityRef.current = Date.now();
    };
    window.addEventListener('pointerdown', markActivity);
    window.addEventListener('keydown', markActivity);
    return () => {
      window.removeEventListener('pointerdown', markActivity);
      window.removeEventListener('keydown', markActivity);
    };
  }, []);

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

      if (idleDurationMs >= LONG_IDLE_NAP_TIMEOUT_MS) {
        setBaseState('nap');
        return;
      }
      if (baseState === 'nap') {
        setBaseState('idle');
        return;
      }
      if (idleDurationMs >= IDLE_WANDER_TIMEOUT_MS) {
        setBaseState((prev) => (prev === 'walk' ? 'sit' : 'walk'));
      } else {
        setBaseState('idle');
      }
    };
    const intervalId = setInterval(tick, WANDER_TICK_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [baseState, isStreaming]);

  return { baseState, isStreaming, reaction, reactionNonce, triggerClick, clearReaction };
}
