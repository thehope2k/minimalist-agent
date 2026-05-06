import { useState } from 'react';
import { X } from 'lucide-react';
import { IconButton } from '@/components/ui';
import { SddModeToggle } from '@/components/sdd/SddModeToggle';
import { SddPanel } from '@/components/sdd/SddPanel';
import { SddArtifactViewer } from '@/components/sdd/SddArtifactViewer';
import type { SddFeature, SddSessionState } from '@/lib/sdd';

interface Props {
  activeSession: string;
  sddMode: 'auto' | 'off';
  sddState: SddSessionState | null;
  sddLoading: boolean;
  isStreaming: boolean;
  onModeChange: (mode: 'auto' | 'off') => void;
  onRefreshScan: () => void;
  onMappingChange: (svcPath: string, entityRoot: string | null) => void;
  onNewProject: () => void;
  onClose: () => void;
}

/**
 * Right-side workspace panel — switches between the SDD entity/feature list
 * and the artifact viewer for a selected feature.
 *
 * Stores only a stable key (featurePath + entityRootPath) rather than the
 * full feature object so the artifact viewer always receives fresh feature
 * data from sddState (updated by the useSdd hook's artifact-changed handler).
 * This avoids the viewer holding a stale snapshot while the agent is writing.
 */
export function SddWorkspacePanel({
  activeSession,
  sddMode,
  sddState,
  sddLoading,
  isStreaming,
  onModeChange,
  onRefreshScan,
  onMappingChange,
  onNewProject,
  onClose,
}: Props) {
  const [viewerKey, setViewerKey] = useState<{
    featurePath: string;
    entityRootPath: string;
  } | null>(null);

  // Derive the live feature and entity from sddState on every render so the
  // artifact viewer always has the freshest data (updated mtimes, task counts, etc.)
  const activeViewerData = viewerKey && sddState
    ? (() => {
        const entity = sddState.entities.find((e) => e.rootPath === viewerKey.entityRootPath);
        const feature = entity?.features.find((f) => f.path === viewerKey.featurePath);
        return entity && feature ? { feature, entity } : null;
      })()
    : null;

  // Auto-advance: single entity + single feature → skip the list, go straight
  // to the artifact viewer without requiring an explicit click.
  const autoViewerData = (() => {
    if (activeViewerData || !sddState) return null;
    if (sddState.entities.length !== 1) return null;
    if (sddState.entities[0].features.length !== 1) return null;
    const entity = sddState.entities[0];
    return { feature: entity.features[0], entity };
  })();

  const displayData = activeViewerData ?? autoViewerData;
  const isAutoAdvanced = !activeViewerData && !!autoViewerData;

  return (
    <div className="flex h-full flex-col border-l border-border bg-panel">
      {/* Panel header */}
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-3">
        {displayData && !isAutoAdvanced ? (
          <button
            onClick={() => setViewerKey(null)}
            className="flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg transition-colors"
          >
            ← Back
          </button>
        ) : (
          <span className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Workspace</span>
        )}
        <div className="flex items-center gap-1">
          <SddModeToggle
            mode={sddMode}
            isStreaming={isStreaming}
            onModeChange={onModeChange}
          />
          <IconButton
            icon={X}
            label="Close workspace panel"
            onClick={() => { onClose(); setViewerKey(null); }}
          />
        </div>
      </div>

      {/* Panel content */}
      <div className="flex-1 overflow-hidden">
        {displayData ? (
          <SddArtifactViewer
            feature={displayData.feature}
            entityRootPath={displayData.entity.rootPath}
            constitutionMtime={displayData.entity.constitutionMtime}
            onClose={() => setViewerKey(null)}
          />
        ) : (
          <div className="h-full overflow-y-auto scroll-thin">
            <SddPanel
              sessionId={activeSession}
              state={sddState}
              loading={sddLoading}
              sddMode={sddMode}
              onRefreshScan={onRefreshScan}
              onMappingChange={(svcPath, entityRoot) => onMappingChange(svcPath, entityRoot)}
              onFeatureOpen={(feature: SddFeature, entityRootPath: string) =>
                setViewerKey({ featurePath: feature.path, entityRootPath })
              }
              onNewProject={onNewProject}
            />
          </div>
        )}
      </div>
    </div>
  );
}
