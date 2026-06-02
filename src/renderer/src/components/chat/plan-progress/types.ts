import type { Plan, Phase } from '@/lib/electron';

export interface PlanProgressProps {
  sessionId: string;
  plan: Plan;
}

export interface PhaseItemProps {
  phase: Phase;
  expanded: boolean;
  onToggle: () => void;
}
