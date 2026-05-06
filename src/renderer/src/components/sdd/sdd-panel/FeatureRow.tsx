import { artifactBadges, phaseLabel } from '@/lib/sdd';
import { ArtifactBadge } from './ArtifactBadge';
import type { FeatureRowProps } from './types';

export function FeatureRow({ feature, onOpen }: FeatureRowProps) {
  const badges = artifactBadges(feature.artifacts);
  const phase = phaseLabel(feature.currentPhase);

  return (
    <button
      onClick={onOpen}
      className="w-full text-left flex flex-col py-1.5 px-2 rounded hover:bg-elevated-2 transition-colors group"
    >
      {/* Slug row — phase label lives here so it doesn't steal width from the badge row */}
      <div className="flex items-center gap-1.5 mb-1 min-w-0">
        <span className="text-sm font-medium text-fg truncate flex-1 min-w-0">{feature.slug}</span>
        <span className="text-xs text-fg-subtle shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {phase} →
        </span>
        <span className="text-xs text-fg-subtle shrink-0">#{feature.number}</span>
      </div>
      {/* Badge row — uses full available width; flex-wrap as safety for very narrow panels */}
      <div className="flex flex-wrap gap-1">
        {badges.map((b) => (
          <ArtifactBadge key={b.label} label={b.label} done={b.done} tooltip={b.tooltip} />
        ))}
      </div>
    </button>
  );
}
