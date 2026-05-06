import { useRef, useState } from 'react';
import { Badge } from '@/components/ui';
import { phaseActionMessage, phaseLabel, phaseNext } from '@/lib/sdd';
import type { SddFeature, SddPhase } from '@/lib/sdd';

interface Props {
  phase: SddPhase;
  entityName?: string;
  /** The feature slug that is driving the current phase (earliest-phase feature). */
  blockingFeatureName?: string;
  /** Human-readable progress for the blocking feature, e.g. "3/10 tasks". */
  blockingProgress?: string;
  /** The actual feature object — used to build the phase action message. */
  blockingFeature?: SddFeature;
  /** Called with the pre-composed message when the action button is clicked. */
  onPhaseAction?: (message: string) => void;
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
  blockingFeature,
  onPhaseAction,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const label = phaseLabel(phase);
  const next = phaseNext(phase);
  const isComplete = phase === 'complete';

  const featureDetail = blockingFeatureName
    ? ` · ${blockingFeatureName}${blockingProgress ? ` (${blockingProgress})` : ''}`
    : '';
  const tooltip = entityName
    ? `${entityName} — ${next}${featureDetail}`
    : `${next}${featureDetail}`;

  const actionMessage = blockingFeature ? phaseActionMessage(blockingFeature) : null;
  const canAct = !isComplete && !!actionMessage && !!onPhaseAction;

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => canAct && setOpen((v) => !v)}
        className={canAct ? 'cursor-pointer' : 'cursor-default'}
        aria-label={canAct ? `SDD phase: ${label}. Click to start next phase.` : `SDD phase: ${label}`}
        title={tooltip}
      >
        <Badge
          variant={PHASE_VARIANT[phase]}
          className="text-xs px-2 py-0.5 pointer-events-none"
        >
          SDD · {label}
        </Badge>
      </button>

      {/* Popover */}
      {open && canAct && (
        <>
          {/* Backdrop — closes popover on outside click */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-full mt-1 z-50 w-64 rounded-md border border-border bg-panel shadow-lg p-3 flex flex-col gap-2">
            {entityName && (
              <p className="text-xs font-semibold text-fg truncate">{entityName}</p>
            )}
            {blockingFeatureName && (
              <p className="text-xs text-fg-muted truncate">
                Feature: {blockingFeatureName}
                {blockingProgress && <span className="text-fg-subtle"> · {blockingProgress}</span>}
              </p>
            )}
            <p className="text-xs text-fg-subtle">{next}</p>
            <button
              onClick={() => {
                onPhaseAction!(actionMessage!);
                setOpen(false);
              }}
              className="self-start text-xs bg-elevated-2 hover:bg-elevated-3 text-fg px-3 py-1 rounded transition-colors"
            >
              ▶ Start {label}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
