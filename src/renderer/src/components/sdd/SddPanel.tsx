import { RefreshCw, Plus } from 'lucide-react';
import { IconButton } from '@/components/ui';
import { EntityCard } from './sdd-panel/EntityCard';
import { UnassignedSection } from './sdd-panel/UnassignedSection';
import type { SddPanelProps } from './sdd-panel/types';

export function SddPanel({
  state,
  loading,
  sddMode,
  onRefreshScan,
  onMappingChange,
  onFeatureOpen,
  onConstitutionOpen,
  onNewProject,
}: SddPanelProps) {
  // SDD is turned off — state will be null because useSdd clears it on Off.
  // Show a distinct message so the user knows specs exist but SDD is disabled.
  if (sddMode === 'off') {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 px-4 text-center">
        <p className="text-xs text-fg-muted">SDD is disabled for this session.</p>
        <p className="text-[10px] text-fg-subtle">
          Use the toggle above to re-enable it.
        </p>
      </div>
    );
  }

  // SDD is on but scan returned no entities.
  if (!state || state.entities.length === 0) {
    const depth = state?.scannedDepth ?? 3;
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-6 px-4 text-center">
        <p className="text-xs text-fg-subtle">No SDD specs found in this workspace.</p>
        <p className="text-[10px] text-fg-subtle opacity-70">
          Scanned {depth} director{depth === 1 ? 'y' : 'ies'} deep.
          If your .specify/ is nested further, open a closer folder or increase
          the scan depth in AI Settings.
        </p>
        <button
          onClick={onNewProject}
          className="flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg transition-colors"
        >
          <Plus size={12} />
          New SDD Project
        </button>
      </div>
    );
  }

  // Single-entity shortcut — skip mapping UI
  const showMapping = state.entities.length > 1;

  return (
    <div className="flex flex-col gap-1 px-2 pb-2">
      {/* Header row */}
      <div className="flex items-center justify-between py-1.5">
        <span className="text-xs font-semibold text-fg-muted uppercase tracking-wide">
          SDD
        </span>
        <div className="flex items-center gap-1">
          {state.cliMissing && (
            <span
              className="text-xs text-fg-subtle"
              title="specify CLI not found. SDD panel works, but 'New SDD Project' requires the CLI."
            >
              ⚠️ CLI missing
            </span>
          )}
          <IconButton
            icon={RefreshCw}
            iconClassName={loading ? 'animate-spin' : ''}
            onClick={onRefreshScan}
            disabled={loading}
            title="Re-scan workspace"
          />
        </div>
      </div>

      {/* Entity cards */}
      {state.entities.map((entity) => {
        const mapping = showMapping
          ? state.mappings.find((m) => m.entityRootPath === entity.rootPath)
          : undefined;
        return (
          <EntityCard
            key={entity.rootPath}
            entity={entity}
            mapping={mapping}
            allEntities={state.entities}
            onFeatureOpen={onFeatureOpen}
            onMappingChange={onMappingChange}
            onConstitutionOpen={onConstitutionOpen}
          />
        );
      })}

      {/* Unassigned section — only when multiple entities exist */}
      {showMapping && (
        <UnassignedSection
          unmappedServices={state.unmappedServices}
          unmappedEntities={state.unmappedEntities}
          allEntities={state.entities}
          onAssign={(svcPath, entityRootPath) =>
            onMappingChange(svcPath, entityRootPath)
          }
        />
      )}
    </div>
  );
}
