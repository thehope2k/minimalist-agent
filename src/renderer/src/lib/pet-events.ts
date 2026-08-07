export type PetEventType = 'tool-start' | 'tool-error' | 'commit-success';

declare global {
  interface Window {
    __minimalPetEventBus?: EventTarget;
  }
}

function getBus(): EventTarget {
  return (window.__minimalPetEventBus ??= new EventTarget());
}

export function emitPetEvent(type: PetEventType): void {
  getBus().dispatchEvent(new Event(type));
}

export function subscribePetEvent(type: PetEventType, handler: () => void): () => void {
  const bus = getBus();
  bus.addEventListener(type, handler);
  return () => bus.removeEventListener(type, handler);
}
