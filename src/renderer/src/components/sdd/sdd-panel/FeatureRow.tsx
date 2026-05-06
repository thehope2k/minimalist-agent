import { Pin } from 'lucide-react';
import { artifactBadges, phaseActionMessage } from '@/lib/sdd';
import type { SddPhase } from '@/lib/sdd';
import { ArtifactBadge } from './ArtifactBadge';
import type { FeatureRowProps } from './types';

const PHASE_ACTION_LABEL: Record<SddPhase, string> = {
  constitution: '▶ Constitution',
  specify:      '▶ Specify',
  plan:         '▶ Plan',
  tasks:        '▶ Tasks',
  implement:    '▶ Implement',
  complete:     '',
};

export function FeatureRow({
  feature,
  isActive,
  isSingleFeature,
  onOpen,
  onPin,
  onPhaseAction,
}: FeatureRowProps) {
  const badges = artifactBadges(feature.artifacts);
  const actionLabel = PHASE_ACTION_LABEL[feature.currentPhase];
  const actionMessage = phaseActionMessage(feature);
  const isComplete = feature.currentPhase === 'complete';

  return (
    <div
      className={`w-full flex flex-col py-2 px-2.5 rounded-md transition-colors group ${
        isActive ? 'bg-accent/10 ring-1 ring-accent/30' : 'hover:bg-elevated-2'
      }`}
    >
      {/* Row 1: slug + pin + number */}
      <div className="flex items-center gap-1.5 mb-1.5 min-w-0">
        <button
          onClick={onOpen}
          className="flex-1 text-left text-sm font-medium text-fg truncate min-w-0 hover:text-accent transition-colors"
          title={`Open ${feature.name}`}
        >
          {feature.slug}
        </button>



        {/* Pin button — always visible, subdued when unpinned */}
        {!isSingleFeature && (
          <button
            onClick={(e) => { e.stopPropagation(); onPin(); }}
            className={`shrink-0 p-0.5 rounded transition-colors ${
              isActive
                ? 'text-accent hover:opacity-70'
                : 'text-fg-subtle opacity-40 hover:opacity-100 hover:text-fg'
            }`}
            title={isActive ? 'Unpin feature' : 'Set as active feature for this session'}
          >
            <Pin size={12} className={isActive ? 'fill-accent/30' : ''} />
          </button>
        )}

        <span className="text-[10px] text-fg-subtle shrink-0 tabular-nums">
          #{feature.number}
        </span>
      </div>

      {/* Row 2: artifact badges */}
      <div className="flex flex-wrap items-center gap-1 mb-1">
        {badges.map((b) => (
          <ArtifactBadge key={b.label} label={b.label} done={b.done} tooltip={b.tooltip} />
        ))}
        {isComplete && (
          <span className="text-[10px] text-fg-subtle ml-0.5">✅ done</span>
        )}
      </div>

      {/* Row 3: phase action button — in flow, not overlapping */}
      {!isComplete && actionLabel && (
        <button
          onClick={(e) => { e.stopPropagation(); onPhaseAction(actionMessage); }}
          className="self-start text-[10px] font-medium text-fg-muted hover:text-fg bg-elevated-2 hover:bg-elevated-3 border border-border px-2 py-0.5 rounded transition-colors"
          title={`Send to agent: ${actionMessage}`}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
