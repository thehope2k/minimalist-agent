import { artifactBadges, phaseLabel } from '@/lib/sdd';
import { ArtifactBadge } from './ArtifactBadge';
import type { FeatureRowProps } from './types';

export function FeatureRow({ feature, onOpen }: FeatureRowProps) {
  const badges = artifactBadges(feature.artifacts);
  const phase = phaseLabel(feature.currentPhase);

  return (
    <button
      onClick={onOpen}
      className="w-full text-left flex items-start gap-2 py-1.5 px-2 rounded hover:bg-elevated-2 transition-colors group"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-xs font-medium text-fg truncate">{feature.slug}</span>
          <span className="text-xs text-fg-subtle shrink-0">#{feature.number}</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {badges.map((b) => (
            <ArtifactBadge key={b.label} label={b.label} done={b.done} tooltip={b.tooltip} />
          ))}
        </div>
      </div>
      <span className="text-xs text-fg-subtle shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {phase} →
      </span>
    </button>
  );
}
