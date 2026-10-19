import { AppWindow } from 'lucide-react';
import { Button } from '@/components/ui';

export function PoppedOut({ sessionId }: { sessionId: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <AppWindow className="h-8 w-8 text-fg-subtle" strokeWidth={1.5} />
      <p className="text-sm text-fg">This chat's browser is in a separate window</p>
      <Button variant="outline" onClick={() => void window.api.browser.dock(sessionId)}>
        Bring it back
      </Button>
    </div>
  );
}
