import { Bot } from 'lucide-react';
import { Button } from '@/components/ui';

type Props = {
  sessionId: string;
  activity: string;
};

/** What the agent is doing on the page, with a one-click takeover. */
export function ActivityBar({ sessionId, activity }: Props) {
  return (
    <div className="flex h-9 shrink-0 items-center gap-2 border-t border-border px-3 text-xs">
      <Bot className="h-3.5 w-3.5 shrink-0 animate-pulse text-accent" strokeWidth={2} />
      <span className="min-w-0 flex-1 truncate text-fg-muted">Agent is {activity}</span>
      <Button variant="ghost" size="sm" onClick={() => void window.api.browser.release(sessionId)}>
        Take over
      </Button>
    </div>
  );
}
