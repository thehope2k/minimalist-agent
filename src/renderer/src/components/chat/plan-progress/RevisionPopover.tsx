import { useEffect } from 'react';
import { RefreshCw, X } from 'lucide-react';
import type { Plan } from '@/lib/electron';

interface RevisionPopoverProps {
  plan: Plan;
  open: boolean;
  onClose: () => void;
}

export function RevisionPopover({ plan, open, onClose }: RevisionPopoverProps) {
  // Close popover on Escape key
  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop to close on outside click */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Popover content - positioned above button */}
      <div className="absolute left-0 bottom-full mb-2 z-50 w-96 rounded-md border border-accent/30 bg-panel shadow-lg">
        <div className="px-3 py-2.5 border-b border-border/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-sm font-medium text-accent">
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Plan Revisions</span>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-elevated-1 text-fg-subtle hover:text-fg transition-colors"
              aria-label="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="max-h-80 overflow-y-auto scroll-thin px-3 py-2 space-y-3 text-xs">
          {plan.revisions.map((rev, idx) => (
            <div key={idx} className="space-y-1.5">
              <div className="font-medium text-accent">
                v{rev.version} ← v{rev.version - 1}
              </div>
              <div>
                <span className="font-medium text-fg-subtle">Reason:</span>
                <p className="text-fg mt-0.5 leading-relaxed">{rev.reason}</p>
              </div>
              <div>
                <span className="font-medium text-fg-subtle">Changes:</span>
                <p className="text-fg mt-0.5 leading-relaxed">
                  {rev.changeSummary}
                </p>
              </div>
              {rev.changedPhases.length > 0 && (
                <div className="text-fg-subtle pt-0.5">
                  {rev.changedPhases.length} phase(s) modified
                </div>
              )}
              {idx < plan.revisions.length - 1 && (
                <div className="border-t border-border/30 pt-3 -mb-1.5" />
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
