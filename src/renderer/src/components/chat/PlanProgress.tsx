/**
 * Plan Progress Widget - Shows real-time execution progress for multi-phase plans.
 * 
 * Displays current plan with all phases, their status, risk levels, and findings.
 * Updates in real-time as phases complete. Can be collapsed/expanded.
 */

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Play, Check, AlertCircle, Circle, X, RefreshCw, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Plan, Phase } from '@/lib/electron';

interface PlanProgressProps {
  sessionId: string;
  plan: Plan;
}

export function PlanProgress({ sessionId, plan }: PlanProgressProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());
  const [showRevisionPopover, setShowRevisionPopover] = useState(false);

  // Reset local UI state when this bubble gets a different plan.
  useEffect(() => {
    setCollapsed(false);
    setExpandedPhases(new Set());
    setShowRevisionPopover(false);
  }, [plan.id]);

  // Close popover on Escape key
  useEffect(() => {
    if (!showRevisionPopover) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowRevisionPopover(false);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [showRevisionPopover]);

  if (plan.status === 'cancelled') return null;

  const togglePhase = (phaseId: string) => {
    setExpandedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(phaseId)) {
        next.delete(phaseId);
      } else {
        next.add(phaseId);
      }
      return next;
    });
  };

  const handleCancel = async () => {
    if (confirm('Cancel this plan? Execution will stop.')) {
      await window.api.planning.cancelPlan(sessionId);
    }
  };

  return (
    <div className="rounded-md border border-border/50 bg-elevated-1/40 backdrop-blur-sm text-sm">
      {/* Header - Compact */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center gap-2 px-3 py-2 hover:bg-elevated-1 transition-colors rounded-md group"
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Expand plan' : 'Collapse plan'}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="font-medium text-fg text-sm truncate">
            {plan.task.length > 50 ? plan.task.substring(0, 50) + '...' : plan.task}
          </span>
          {plan.version > 1 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-accent/20 text-accent font-medium">
              v{plan.version}
            </span>
          )}
        </div>
        <span className="text-xs text-fg-muted font-mono tabular-nums">
          {plan.phases.filter((p) => p.status === 'complete').length}/{plan.phases.length}
        </span>
        {collapsed ? (
          <ChevronRight className="h-3.5 w-3.5 text-fg-subtle group-hover:text-fg transition-colors shrink-0" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-fg-subtle group-hover:text-fg transition-colors shrink-0" />
        )}
      </button>

      {/* Phase List */}
      {!collapsed && (
        <div className="border-t border-border/50 px-3 py-2 space-y-1.5">
          {plan.phases.map((phase) => (
            <PhaseItem
              key={phase.id}
              phase={phase}
              expanded={expandedPhases.has(phase.id)}
              onToggle={() => togglePhase(phase.id)}
            />
          ))}

          {/* Actions */}
          {plan.status === 'active' && (
            <div className="flex gap-1.5 pt-2 mt-2 border-t border-border/50 relative">
              <button
                onClick={handleCancel}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded hover:bg-elevated-2 text-fg-muted hover:text-fg transition-colors"
                aria-label="Cancel plan"
              >
                <X className="h-3 w-3" />
                Cancel
              </button>
              
              {/* Revision Badge - Show if plan was revised */}
              {plan.version > 1 && plan.revisions.length > 0 && (
                <>
                  <button
                    onClick={() => setShowRevisionPopover(!showRevisionPopover)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded hover:bg-accent/20 border border-accent/30 bg-accent/10 text-accent transition-colors"
                    aria-label="View revision details"
                  >
                    <RefreshCw className="h-3 w-3" />
                    <span>Revised (v{plan.version})</span>
                  </button>
                  
                  {/* Popover */}
                  {showRevisionPopover && (
                    <>
                      {/* Backdrop to close on outside click */}
                      <div 
                        className="fixed inset-0 z-40" 
                        onClick={() => setShowRevisionPopover(false)}
                      />
                      
                      {/* Popover content - positioned above button */}
                      <div className="absolute left-0 bottom-full mb-2 z-50 w-96 rounded-md border border-accent/30 bg-panel shadow-lg">
                        <div className="px-3 py-2.5 border-b border-border/50">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-sm font-medium text-accent">
                              <RefreshCw className="h-3.5 w-3.5" />
                              <span>Plan Revisions</span>
                            </div>
                            <button
                              onClick={() => setShowRevisionPopover(false)}
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
                                <p className="text-fg mt-0.5 leading-relaxed">{rev.changeSummary}</p>
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
                  )}
                </>
              )}
            </div>
          )}

          {plan.status === 'completed' && (
            <div className="pt-2 mt-2 border-t border-border/50 text-xs text-green-600 dark:text-green-400 font-medium">
              ✓ Plan completed
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================ */
/*  Phase Item                                                    */
/* ============================================================ */

interface PhaseItemProps {
  phase: Phase;
  expanded: boolean;
  onToggle: () => void;
}

function PhaseItem({ phase, expanded, onToggle }: PhaseItemProps) {
  const statusIcon = {
    pending: <Circle className="h-3.5 w-3.5 text-fg-subtle" />,
    running: <Play className="h-3.5 w-3.5 text-blue-500 animate-pulse" />,
    complete: <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />,
    blocked: <AlertCircle className="h-3.5 w-3.5 text-yellow-600 dark:text-yellow-400" />,
    error: <AlertCircle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />,
    skipped: <Circle className="h-3.5 w-3.5 text-fg-subtle opacity-50" />,
  }[phase.status];

  const riskColor =
    phase.risk < 30 ? 'text-green-600 dark:text-green-400' :
    phase.risk < 60 ? 'text-yellow-600 dark:text-yellow-400' :
    'text-red-600 dark:text-red-400';

  const duration = phase.completedAt && phase.startedAt
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
          className={cn('text-[10px] font-medium tabular-nums whitespace-nowrap', riskColor)}
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
        {phase.findings && (
          <FileText 
            className="h-3 w-3 text-fg-muted shrink-0"
          />
        )}
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
                  <li key={idx} className="text-fg-muted flex items-start gap-1.5">
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
              <p className="text-fg whitespace-pre-wrap leading-relaxed">{phase.findings}</p>
            </div>
          )}

          {/* Error */}
          {phase.error && (
            <div>
              <div className="font-medium text-red-600 dark:text-red-400 uppercase tracking-wide mb-1">
                Error
              </div>
              <p className="text-red-600 dark:text-red-400 whitespace-pre-wrap">{phase.error}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
