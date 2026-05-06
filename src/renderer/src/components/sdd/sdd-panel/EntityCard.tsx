import { Badge } from '@/components/ui';
import type { EntityCardProps } from './types';
import { FeatureRow } from './FeatureRow';
import { ConstitutionRow } from './ConstitutionRow';
import { MappingControl } from './MappingControl';
import { phaseLabel } from '@/lib/sdd';
import { deriveEntityPhase } from '@/lib/sdd';

const ROLE_LABELS = {
  embedded: 'embedded',
  paired: 'paired',
  standalone: 'standalone',
  shared: 'shared',
} as const;

export function EntityCard({
  entity,
  mapping,
  allEntities,
  activeFeatureSlug,
  onFeatureOpen,
  onMappingChange,
  onConstitutionOpen,
  onPinFeature,
  onPhaseAction,
}: EntityCardProps) {
  const entityPhase = deriveEntityPhase(entity.features, entity.hasConstitution);
  const isSingleFeature = entity.features.length === 1;

  return (
    <div className="border border-border rounded-md overflow-hidden mb-2">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-elevated-2">
        <span className="text-xs font-semibold text-fg flex-1 truncate">
          {entity.name}
        </span>
        <Badge variant="default" className="text-xs px-1.5 py-0 shrink-0">
          {phaseLabel(entityPhase)}
        </Badge>
        <Badge variant="default" className="text-xs px-1.5 py-0 shrink-0">
          {ROLE_LABELS[entity.role]}
        </Badge>
      </div>

      {/* Mapped service — show reassign control when multiple entities exist */}
      {mapping && (
        <div className="flex items-center gap-2 px-3 py-1 border-b border-border text-xs text-fg-muted">
          <span className="flex-1 truncate">→ {mapping.serviceName}</span>
          {allEntities.length > 1 && (
            <MappingControl
              currentMapping={mapping}
              allEntities={allEntities}
              onMappingChange={(entityRootPath) =>
                onMappingChange(mapping.servicePath, entityRootPath)
              }
            />
          )}
          {mapping.confidence === 'medium' && (
            <span className="text-fg-subtle shrink-0">(suggested)</span>
          )}
        </div>
      )}

      {/* Constitution — entity-level, above features */}
      <div className="border-b border-border">
        <ConstitutionRow
          hasConstitution={entity.hasConstitution}
          onOpen={() => onConstitutionOpen(entity.rootPath)}
        />
      </div>

      {/* Features */}
      <div className="divide-y divide-border">
        {entity.features.length === 0 ? (
          <p className="px-3 py-2 text-xs text-fg-subtle italic">No features yet</p>
        ) : (
          entity.features.map((f) => (
            <FeatureRow
              key={f.path}
              feature={f}
              isActive={f.name === activeFeatureSlug || f.slug === activeFeatureSlug}
              isSingleFeature={isSingleFeature}
              onOpen={() => onFeatureOpen(f, entity.rootPath)}
              onPin={() => {
                const isCurrentlyActive = f.name === activeFeatureSlug || f.slug === activeFeatureSlug;
                onPinFeature(isCurrentlyActive ? null : f.name);
              }}
              onPhaseAction={(message) => {
                // Auto-pin the feature when a phase action is triggered so the
                // agent gets the lean focused context instead of all features.
                const isCurrentlyActive = f.name === activeFeatureSlug || f.slug === activeFeatureSlug;
                if (!isCurrentlyActive) onPinFeature(f.name);
                onPhaseAction(message);
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}
