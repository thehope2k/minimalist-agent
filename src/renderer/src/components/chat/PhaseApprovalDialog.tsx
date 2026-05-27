/**
 * Phase Approval Dialog - Request user approval for executing a phase.
 * 
 * Shows when a non-safe phase needs approval based on autonomy level.
 * Extends the existing approval collaboration dialog with plan context.
 */

import { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button, Textarea } from '../ui';
import type { Phase } from '@/lib/electron';

interface PhaseApprovalDialogProps {
  phase: Phase;
  onApprove: (note?: string) => void;
  onDeny: (reason?: string) => void;
}

export function PhaseApprovalDialog({
  phase,
  onApprove,
  onDeny,
}: PhaseApprovalDialogProps) {
  const [customNote, setCustomNote] = useState('');
  const [showNote, setShowNote] = useState(false);

  const riskColor =
    phase.risk < 30 ? 'text-green-600 dark:text-green-400' :
    phase.risk < 60 ? 'text-yellow-600 dark:text-yellow-400' :
    'text-red-600 dark:text-red-400';

  const handleApprove = () => {
    onApprove(customNote.trim() || undefined);
  };

  const handleDeny = () => {
    onDeny(customNote.trim() || undefined);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleApprove();
    } else if (e.key === 'Escape') {
      handleDeny();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onKeyDown={handleKeyDown}>
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={handleDeny}
      />
      
      <div
        className="relative w-[min(580px,calc(100vw-32px))] max-h-[85vh] flex flex-col rounded-xl border border-border bg-panel shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="phase-approval-title"
      >
        {/* Header - Fixed */}
        <div className="shrink-0 border-b border-border px-5 py-4">
          <h2 id="phase-approval-title" className="text-lg font-semibold text-fg">Approve Phase?</h2>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto scroll-thin space-y-4 p-5">
          {/* Phase Info */}
          <div>
            <div className="text-lg font-medium text-fg mb-2">
              Phase {phase.index + 1}: {phase.name}
            </div>
            <p className="text-sm text-fg-muted">{phase.description}</p>
          </div>

          {/* Actions */}
          <div className="rounded-lg border border-border bg-elevated-1 p-4">
            <div className="text-xs font-medium text-fg-subtle uppercase mb-2">
              This phase will:
            </div>
            <ul className="space-y-1.5">
              {phase.actions.map((action, idx) => (
                <li key={idx} className="text-sm text-fg flex items-start gap-2">
                  <span className="text-fg-subtle">•</span>
                  <span>{action}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Risk */}
          <div className="flex items-center gap-2 p-3 rounded bg-elevated-1 border border-border">
            <AlertCircle className={`h-5 w-5 ${riskColor}`} />
            <div className="flex-1">
              <div className="text-sm font-medium text-fg">
                Risk Level: {phase.risk}/100
              </div>
              <div className="text-xs text-fg-muted">
                {phase.risk < 30 ? 'Low risk - minimal changes' :
                 phase.risk < 60 ? 'Medium risk - file modifications' :
                 'High risk - significant changes'}
              </div>
            </div>
          </div>

          {/* Add Note */}
          {!showNote ? (
            <button
              onClick={() => setShowNote(true)}
              className="text-sm text-accent hover:underline"
            >
              + Add note or instructions
            </button>
          ) : (
            <div>
              <label className="block text-sm font-medium text-fg mb-1.5">
                Note (optional)
              </label>
              <Textarea
                value={customNote}
                onChange={(e) => setCustomNote(e.target.value)}
                placeholder="Any additional instructions or concerns..."
                rows={3}
                autoFocus
              />
            </div>
          )}
        </div>

        {/* Actions - Fixed at bottom */}
        <div className="shrink-0 border-t border-border px-5 py-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={handleDeny}>
            Deny
          </Button>
          <Button variant="primary" onClick={handleApprove}>
            Approve
          </Button>
        </div>

        {/* Keyboard hints - Fixed at bottom */}
        <div className="shrink-0 border-t border-border px-5 py-2 text-xs text-fg-subtle">
          <kbd>Enter</kbd> or <kbd>⌘Enter</kbd> to approve • <kbd>Esc</kbd> to deny
        </div>
      </div>
    </div>
  );
}
