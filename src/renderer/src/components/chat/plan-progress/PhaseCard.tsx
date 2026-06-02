import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  FileText,
  Play,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PhaseItemProps } from './types';

export function PhaseCard({ phase, expanded, onToggle }: PhaseItemProps) {
  const statusIcon = {
    pending: <Circle className="h-3.5 w-3.5 text-fg-subtle" />,
    running: <Play className="h-3.5 w-3.5 text-blue-500 animate-pulse" />,
    complete: <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />,
    blocked: (
      <AlertCircle className="h-3.5 w-3.5 text-yellow-600 dark:text-yellow-400" />
    ),
    error: (
      <AlertCircle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
    ),
    skipped: <Circle className="h-3.5 w-3.5 text-fg-subtle opacity-50" />,
  }[phase.status];

  const riskColor =
    phase.risk < 30
      ? 'text-green-600 dark:text-green-400'
      : phase.risk < 60
        ? 'text-yellow-600 dark:text-yellow-400'
        : 'text-red-600 dark:text-red-400';

  const duration =
    phase.completedAt && phase.startedAt
      ? Math.round((phase.completedAt - phase.startedAt) / 1000)
      : null;

  return (
    <div className="rounded border border-border/50 bg-panel/30 overflow-hidden">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 hover:bg-elevated-1 transition-colors text-left"
        aria-expanded={expanded}
        aria-label={`${phase.name} - ${phase.status}`}
      >
        {statusIcon}
        <span className="text-xs font-medium text-fg truncate flex-1">
          {phase.name}
        </span>
        {phase.risk >= 60 && (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 font-medium whitespace-nowrap"
            title="High risk phase - may modify files or system"
          >
            high risk
          </span>
        )}
        {/* Metadata - Inline */}
        <span
          className={cn(
            'text-[10px] font-medium tabular-nums whitespace-nowrap',
            riskColor,
          )}
          title={`Risk score: ${phase.risk}/100 (${phase.risk < 30 ? 'low' : phase.risk < 60 ? 'moderate' : 'high'})`}
        >
          risk {phase.risk}
        </span>
        {duration !== null && (
          <span
            className="text-[10px] text-fg-subtle tabular-nums whitespace-nowrap"
            title="Execution time"
          >
            {duration}s
          </span>
        )}
        {phase.findings && <FileText className="h-3 w-3 text-fg-muted shrink-0" />}
        {expanded ? (
          <ChevronDown className="h-3 w-3 text-fg-subtle shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 text-fg-subtle shrink-0" />
        )}
      </button>

      {/* Expanded Details */}
      {expanded && (
        <div className="border-t border-border/50 px-2.5 py-2 space-y-2 bg-panel/50 text-xs">
          {/* Description */}
          <div>
            <div className="font-medium text-fg-subtle uppercase tracking-wide mb-1">
              Description
            </div>
            <p className="text-fg-muted">{phase.description}</p>
          </div>

          {/* Actions */}
          {phase.actions.length > 0 && (
            <div>
              <div className="font-medium text-fg-subtle uppercase tracking-wide mb-1">
                Actions
              </div>
              <ul className="space-y-0.5">
                {phase.actions.map((action, idx) => (
                  <li
                    key={idx}
                    className="text-fg-muted flex items-start gap-1.5"
                  >
                    <span className="text-fg-subtle mt-0.5">•</span>
                    <span>{action}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Findings */}
          {phase.findings && (
            <div>
              <div className="font-medium text-fg-subtle uppercase tracking-wide mb-1">
                Findings
              </div>
              <p className="text-fg whitespace-pre-wrap leading-relaxed">
                {phase.findings}
              </p>
            </div>
          )}

          {/* Error */}
          {phase.error && (
            <div>
              <div className="font-medium text-red-600 dark:text-red-400 uppercase tracking-wide mb-1">
                Error
              </div>
              <p className="text-red-600 dark:text-red-400 whitespace-pre-wrap">
                {phase.error}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
