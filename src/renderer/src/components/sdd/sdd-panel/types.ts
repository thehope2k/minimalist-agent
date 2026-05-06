import type { SddEntity, SddFeature, SddMapping, SddSessionState } from '@/lib/sdd';
import type { ArtifactBadge } from '@/lib/sdd';

export type { ArtifactBadge };

export interface EntityCardProps {
  entity: SddEntity;
  mapping?: SddMapping;
  allEntities: SddEntity[];
  onFeatureOpen: (feature: SddFeature, entityRootPath: string) => void;
  onMappingChange: (servicePath: string, entityRootPath: string | null) => void;
  onConstitutionOpen: (entityRootPath: string) => void;
}

export interface FeatureRowProps {
  feature: SddFeature;
  onOpen: () => void;
}

export interface UnassignedSectionProps {
  unmappedServices: string[];
  unmappedEntities: string[];
  allEntities: SddEntity[];
  onAssign: (servicePath: string, entityRootPath: string) => void;
}

export interface SddPanelProps {
  sessionId: string;
  state: SddSessionState | null;
  loading?: boolean;
  sddMode: 'auto' | 'off';
  onRefreshScan: () => void;
  onMappingChange: (servicePath: string, entityRootPath: string | null) => void;
  onFeatureOpen: (feature: SddFeature, entityRootPath: string) => void;
  onConstitutionOpen: (entityRootPath: string) => void;
  onNewProject: () => void;
}
