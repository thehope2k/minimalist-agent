import { Badge } from '@/components/ui';
import { phaseLabel, phaseNext } from '@/lib/sdd';
import type { SddPhase } from '@/lib/sdd';

interface Props {
  phase: SddPhase;
  entityName?: string;
  /** The feature slug that is driving the current phase (earliest-phase feature). */
  blockingFeatureName?: string;
  /** Human-readable progress for the blocking feature, e.g. "3/10 tasks". */
  blockingProgress?: string;
}

const PHASE_VARIANT: Record<SddPhase, 'default' | 'accent' | 'soon'> = {
  constitution: 'soon',
  specify:      'soon',
  plan:         'default',
  tasks:        'default',
  implement:    'accent',
  complete:     'accent',
};

export function SddPhaseBadge({
  phase,
  entityName,
  blockingFeatureName,
  blockingProgress,
}: Props) {
  const label = phaseLabel(phase);
  const next = phaseNext(phase);

  // Build a rich tooltip: "entity — next action (feature: progress)"
  const featureDetail = blockingFeatureName
    ? ` · ${blockingFeatureName}${blockingProgress ? ` (${blockingProgress})` : ''}`
    : '';
  const tooltip = entityName
    ? `${entityName} — ${next}${featureDetail}`
    : `${next}${featureDetail}`;

  return (
    <Badge
      variant={PHASE_VARIANT[phase]}
      className="text-xs px-2 py-0.5 shrink-0"
      title={tooltip}
    >
      SDD · {label}
    </Badge>
  );
}
