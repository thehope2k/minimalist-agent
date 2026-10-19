import { Globe, PanelRightClose } from 'lucide-react';
import { Button, IconButton } from '@/components/ui';

type Props = {
  sessionId: string | null;
  onHidePanel: () => void;
};

export function EmptyState({ sessionId, onHidePanel }: Props) {
  return (
    <div className="relative flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <IconButton
        icon={PanelRightClose}
        label="Hide browser (Cmd+Shift+O)"
        onClick={onHidePanel}
        className="absolute right-1.5 top-1.5"
      />
      <Globe className="h-8 w-8 text-fg-subtle" strokeWidth={1.5} />
      {sessionId ? (
        <>
          <div>
            <p className="text-sm text-fg">No browser in this chat</p>
            <p className="mt-1 text-xs text-fg-subtle">
              Open one to check your app or sign in to a site — the agent uses the same page.
            </p>
          </div>
          <Button variant="outline" onClick={() => void window.api.browser.open(sessionId)}>
            Open browser
          </Button>
        </>
      ) : (
        <p className="text-sm text-fg-subtle">Start a chat to use the browser.</p>
      )}
    </div>
  );
}
