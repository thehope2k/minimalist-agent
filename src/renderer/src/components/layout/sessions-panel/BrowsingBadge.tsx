import { Globe } from 'lucide-react';
import { Tooltip } from '@/components/ui';
import { useBrowserActivity } from '@/components/browser/browser-activity-store';

/** Shown while the agent is using this chat's browser — visible for background chats too. */
export function BrowsingBadge({ sessionId }: { sessionId: string }) {
  const activity = useBrowserActivity(sessionId);
  if (!activity) return null;
  return (
    <Tooltip content={`Agent is ${activity}`}>
      <Globe className="h-3.5 w-3.5 shrink-0 animate-pulse text-accent" strokeWidth={2} />
    </Tooltip>
  );
}
