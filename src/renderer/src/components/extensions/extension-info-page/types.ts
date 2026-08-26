import type { LoadedExtension } from '@/lib/electron';

export type ExtensionInfoPageProps = {
  extension: LoadedExtension | null;
  onClose: () => void;
};

export interface KeyValueRow {
  label: string;
  value: React.ReactNode;
}

export const VARIANT_LABEL: Record<LoadedExtension['variant'], string> = {
  'guide-only': 'Guide-only',
  'cli-bound': 'CLI-bound',
  'mcp-backed': 'MCP-backed',
};
