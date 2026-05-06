import type { SddEntity, SddFeature, SddMapping, SddSessionState } from '@/lib/sdd';
import type { ArtifactBadge } from '@/lib/sdd';

export type { ArtifactBadge };

export interface EntityCardProps {
  entity: SddEntity;
  mapping?: SddMapping;
  allEntities: SddEntity[];
  activeFeatureSlug: string | null;
  onFeatureOpen: (feature: SddFeature, entityRootPath: string) => void;
  onMappingChange: (servicePath: string, entityRootPath: string | null) => void;
  onConstitutionOpen: (entityRootPath: string) => void;
  onPinFeature: (featureSlug: string | null) => void;
  onPhaseAction: (message: string) => void;
}

export interface FeatureRowProps {
  feature: SddFeature;
  /** True when this feature is the pinned active feature for the session. */
  isActive: boolean;
  /**
   * True when the entity has exactly one feature — pin button is hidden
   * (single-feature entities are implicitly active).
   */
  isSingleFeature: boolean;
  onOpen: () => void;
  /** Called when the user clicks the pin/unpin button. */
  onPin: () => void;
  /** Called with the pre-composed message when the phase action button is clicked. */
  onPhaseAction: (message: string) => void;
}

export interface UnassignedSectionProps {
  unmappedServices: string[];
  unmappedEntities: string[];
  allEntities: SddEntity[];
  onAssign: (servicePath: string, entityRootPath: string) => void;
}

export interface SddPanelProps {
  state: SddSessionState | null;
  loading?: boolean;
  sddMode: 'auto' | 'off';
  activeFeatureSlug?: string | null;
  onRefreshScan: () => void;
  onMappingChange: (servicePath: string, entityRootPath: string | null) => void;
  onFeatureOpen: (feature: SddFeature, entityRootPath: string) => void;
  onConstitutionOpen: (entityRootPath: string) => void;
  onNewProject: () => void;
  onPinFeature: (featureSlug: string | null) => void;
  onPhaseAction: (message: string) => void;
}
