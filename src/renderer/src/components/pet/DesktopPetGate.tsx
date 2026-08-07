import { lazy, Suspense, useEffect, useState } from 'react';
import { getAppSettings, PET_ENABLED_CHANGED_EVENT } from '@/lib/app-settings';

const DesktopPet = lazy(() => import('./DesktopPet').then((m) => ({ default: m.DesktopPet })));

interface DesktopPetGateProps {
  isStreaming: boolean;
}

export function DesktopPetGate({ isStreaming }: DesktopPetGateProps) {
  const [enabled, setEnabled] = useState(() => getAppSettings().petEnabled);

  useEffect(() => {
    const onChange = (event: Event) => setEnabled((event as CustomEvent<boolean>).detail);
    window.addEventListener(PET_ENABLED_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(PET_ENABLED_CHANGED_EVENT, onChange);
  }, []);

  if (!enabled) return null;

  return (
    <Suspense fallback={null}>
      <DesktopPet isStreaming={isStreaming} />
    </Suspense>
  );
}
