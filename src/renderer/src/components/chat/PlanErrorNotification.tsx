/**
 * Plan Error Notification - Shows errors during plan execution with recovery options.
 */

import { useState } from 'react';
import { AlertTriangle, X, RotateCcw, SkipForward, XCircle } from 'lucide-react';
import { Button } from '../ui';

interface PlanErrorNotificationProps {
  error: {
    message: string;
    phaseId?: string;
    recoverable: boolean;
    suggestedAction?: string;
  };
  onRetry?: () => void;
  onSkip?: () => void;
  onCancel?: () => void;
  onDismiss: () => void;
}

export function PlanErrorNotification({
  error,
  onRetry,
  onSkip,
  onCancel,
  onDismiss,
}: PlanErrorNotificationProps) {
  const [dismissed, setDismissed] = useState(false);

  const handleDismiss = () => {
    setDismissed(true);
    setTimeout(onDismiss, 200);
  };

  if (dismissed) return null;

  return (
    <div
      className="fixed top-4 right-4 z-50 max-w-md animate-in slide-in-from-top-2 fade-in duration-200"
      style={{ animation: dismissed ? 'slide-out-to-top-2 fade-out 200ms' : undefined }}
    >
      <div className="rounded-lg border border-red-500/50 bg-red-50 dark:bg-red-950/30 shadow-lg backdrop-blur-sm">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-red-500/20 px-4 py-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0" />
            <h3 className="font-semibold text-red-900 dark:text-red-100">
              Plan Execution Error
            </h3>
          </div>
          <button
            onClick={handleDismiss}
            className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="px-4 py-3 space-y-3">
          {/* Error Message */}
          <p className="text-sm text-red-900 dark:text-red-100">
            {error.message}
          </p>

          {/* Suggested Action */}
          {error.suggestedAction && (
            <div className="rounded bg-red-100 dark:bg-red-900/20 px-3 py-2">
              <p className="text-xs text-red-800 dark:text-red-200">
                <strong>Suggested:</strong> {error.suggestedAction}
              </p>
            </div>
          )}

          {/* Recovery Actions */}
          {error.recoverable && (
            <div className="flex flex-wrap gap-2 pt-2">
              {onRetry && (
                <Button
                  variant="outline"
                  onClick={() => {
                    onRetry();
                    handleDismiss();
                  }}
                  className="text-sm"
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                  Retry Phase
                </Button>
              )}
              
              {onSkip && (
                <Button
                  variant="outline"
                  onClick={() => {
                    onSkip();
                    handleDismiss();
                  }}
                  className="text-sm"
                >
                  <SkipForward className="h-3.5 w-3.5 mr-1.5" />
                  Skip Phase
                </Button>
              )}
              
              {onCancel && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    onCancel();
                    handleDismiss();
                  }}
                  className="text-sm text-red-600 dark:text-red-400"
                >
                  <XCircle className="h-3.5 w-3.5 mr-1.5" />
                  Cancel Plan
                </Button>
              )}
            </div>
          )}

          {/* Non-recoverable */}
          {!error.recoverable && (
            <p className="text-xs text-red-700 dark:text-red-300 italic">
              This error cannot be automatically recovered. The plan has been stopped.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
