/**
 * Plan Progress Widget - Shows real-time execution progress for multi-phase plans.
 * Displays current plan with all phases, their status, risk levels, and findings.
 * Updates in real-time as phases complete. Can be collapsed/expanded.
 */

import { useEffect, useState } from 'react';
import { PlanHeader } from './plan-progress/PlanHeader';
import { PhaseCard } from './plan-progress/PhaseCard';
import { ActionButtons } from './plan-progress/ActionButtons';
import { RevisionPopover } from './plan-progress/RevisionPopover';
import type { PlanProgressProps } from './plan-progress/types';

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

  return (
    <div className="rounded-md border border-border/50 bg-elevated-1/40 backdrop-blur-sm text-sm">
      <PlanHeader
        plan={plan}
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
      />

      {!collapsed && (
        <div className="border-t border-border/50 px-3 py-2 space-y-1.5">
          {plan.phases.map((phase) => (
            <PhaseCard
              key={phase.id}
              phase={phase}
              expanded={expandedPhases.has(phase.id)}
              onToggle={() => togglePhase(phase.id)}
            />
          ))}

          <ActionButtons
            sessionId={sessionId}
            plan={plan}
            onShowRevisions={() => setShowRevisionPopover(!showRevisionPopover)}
          />

          <RevisionPopover
            plan={plan}
            open={showRevisionPopover}
            onClose={() => setShowRevisionPopover(false)}
          />
        </div>
      )}
    </div>
  );
}
