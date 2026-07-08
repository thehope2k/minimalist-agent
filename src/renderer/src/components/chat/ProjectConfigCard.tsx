import { useEffect, useState } from 'react';
import { Layers, X } from 'lucide-react';

interface ProjectConfigCardProps {
  cwd?: string;
  /** Called when user clicks "open context panel" */
  onOpenContextPanel: () => void;
  /** When true (first message sent), dismiss the card. */
  hasMessages: boolean;
}

/**
 * One-time discovery card shown at the top of a new session when project-local
 * .minimalist-agent/ assets are detected. Dismissed on first user message.
 */
export function ProjectConfigCard({
  cwd,
  onOpenContextPanel,
  hasMessages,
}: ProjectConfigCardProps) {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Reset dismissed state when the project CWD changes so the card
  // can re-appear for a different project in the same session.
  useEffect(() => {
    setDismissed(false);
    setVisible(false);
  }, [cwd]);

  // Check if the CWD has project-local assets
  useEffect(() => {
    if (!cwd || dismissed) return;
    window.api.context.hasProjectAssets(cwd).then((has) => {
      setVisible(has);
    }).catch(() => {});
  }, [cwd, dismissed]);

  // Auto-dismiss when the first message is sent
  useEffect(() => {
    if (hasMessages) setVisible(false);
  }, [hasMessages]);

  if (!visible || dismissed) return null;

  return (
    <div className="mx-4 mt-4 flex items-center gap-3 rounded-lg border border-border bg-elevated px-3 py-2.5 text-sm">
      <Layers className="h-4 w-4 shrink-0 text-fg-muted" strokeWidth={1.75} />
      <span className="flex-1 text-fg-muted">
        Project config loaded from <code className="font-mono text-xs">.minimalist-agent/</code>
      </span>
      <button
        type="button"
        onClick={onOpenContextPanel}
        className="shrink-0 text-xs font-medium text-accent hover:text-accent-hover"
      >
        Open context panel →
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="shrink-0 rounded p-0.5 text-fg-subtle hover:bg-panel hover:text-fg"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" strokeWidth={1.75} />
      </button>
    </div>
  );
}
