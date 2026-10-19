import { Bot, Globe } from 'lucide-react';
import { IconButton } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useBrowserPanel } from '@/components/browser/BrowserPanelContext';
import { useBrowserState } from '@/components/browser/useBrowserState';

type Props = {
  sessionId: string | null;
};

/**
 * The chat header's browser control: a globe toggle when the chat has no
 * page, and the page title plus who's in control when it does. Either way a
 * click shows or hides the browser panel.
 */
export function BrowserStatusPill({ sessionId }: Props) {
  const state = useBrowserState(sessionId);
  const panel = useBrowserPanel();
  const label = panel.open ? 'Hide browser (Cmd+Shift+O)' : 'Show browser (Cmd+Shift+O)';

  if (!sessionId || !state?.open) {
    return (
      <IconButton
        icon={Globe}
        label={label}
        onClick={panel.toggle}
        className={panel.open ? 'bg-accent/15 text-accent' : undefined}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={panel.toggle}
      title={[label, state.activity && `Agent is ${state.activity}`, state.url]
        .filter(Boolean)
        .join('\n')}
      className={cn(
        'relative flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors',
        panel.open
          ? 'border-accent/40 bg-accent/15 text-accent'
          : 'border-border bg-elevated text-fg-muted hover:text-fg',
        state.activity && !panel.open && 'browsing-ring',
      )}
    >
      <Globe className={cn('h-3.5 w-3.5 shrink-0', !panel.open && 'text-accent')} />
      <span className="max-w-32 truncate">{state.title || state.url || 'Browser'}</span>
      {state.agentControl && <Bot className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />}
    </button>
  );
}
