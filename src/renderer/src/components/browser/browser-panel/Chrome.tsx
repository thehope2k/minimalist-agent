import { useEffect, useRef, useState } from 'react';
import {
  AppWindow,
  ArrowLeft,
  ArrowRight,
  Bot,
  Code,
  MoreHorizontal,
  PanelRightClose,
  RotateCw,
  User,
  X,
  XCircle,
} from 'lucide-react';
import { IconButton, Input, Menu } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { BrowserPaneState } from '@/lib/electron';

type Props = {
  sessionId: string;
  state: BrowserPaneState;
  onHidePanel: () => void;
};

/** Toolbar: history, address field, who-controls chip, close/hide. */
export function Chrome({ sessionId, state, onHidePanel }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const api = window.api.browser;

  // Cmd/Ctrl+L focuses the address field, as in any browser.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key === 'l') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const submit = async () => {
    if (draft === null) return;
    try {
      await api.navigate(sessionId, draft);
      setDraft(null);
      setError(null);
      inputRef.current?.blur();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message.replace(/^Error invoking remote method[^:]*: /, '')
          : 'Invalid address',
      );
    }
  };

  const shownUrl = state.url === 'about:blank' ? '' : state.url;

  return (
    <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border px-1.5">
      <IconButton
        icon={ArrowLeft}
        label="Back"
        disabled={!state.canGoBack}
        onClick={() => void api.history(sessionId, 'back')}
      />
      <IconButton
        icon={ArrowRight}
        label="Forward"
        disabled={!state.canGoForward}
        onClick={() => void api.history(sessionId, 'forward')}
      />
      <IconButton
        icon={state.loading ? X : RotateCw}
        label={state.loading ? 'Stop' : 'Reload'}
        onClick={() => void api.history(sessionId, state.loading ? 'stop' : 'reload')}
      />
      <Input
        ref={inputRef}
        value={draft ?? shownUrl}
        placeholder="Enter a URL (Cmd+L)"
        title={error ?? state.url}
        spellCheck={false}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          setDraft(e.target.value);
          setError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void submit();
          if (e.key === 'Escape') {
            setDraft(null);
            setError(null);
            e.currentTarget.blur();
          }
        }}
        onBlur={() => {
          if (!error) setDraft(null);
        }}
        className={cn(
          'mx-1 h-7 min-w-0 flex-1 py-0 font-mono text-xs',
          error && 'border-red-500/60 focus-visible:ring-red-500/40',
        )}
      />
      <ControlChip sessionId={sessionId} agentControl={state.agentControl} />
      <Menu
        trigger={<IconButton icon={MoreHorizontal} label="More" />}
        menuWidth={200}
        items={[
          {
            label: 'Pop out to window',
            icon: AppWindow,
            onSelect: () => void api.popOut(sessionId),
          },
          { label: 'Open DevTools', icon: Code, onSelect: () => void api.openDevTools(sessionId) },
          'separator',
          {
            label: 'Close page',
            icon: XCircle,
            variant: 'destructive',
            onSelect: () => void api.close(sessionId),
          },
        ]}
      />
      <IconButton icon={PanelRightClose} label="Hide browser (Cmd+Shift+O)" onClick={onHidePanel} />
    </div>
  );
}

function ControlChip({ sessionId, agentControl }: { sessionId: string; agentControl: boolean }) {
  const api = window.api.browser;
  return agentControl ? (
    <button
      type="button"
      onClick={() => void api.release(sessionId)}
      title="The agent can drive this page — click to take over (Cmd/Ctrl+Shift+R)"
      className="flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-accent/15 px-2 text-xs font-medium text-accent hover:bg-accent/25"
    >
      <Bot className="h-3.5 w-3.5" strokeWidth={2} />
      Agent
    </button>
  ) : (
    <button
      type="button"
      onClick={() => void api.handToAgent(sessionId)}
      title="You're in control — click to hand the page back to the agent"
      className="flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-border px-2 text-xs text-fg-muted hover:bg-elevated hover:text-fg"
    >
      <User className="h-3.5 w-3.5" strokeWidth={2} />
      You
    </button>
  );
}
