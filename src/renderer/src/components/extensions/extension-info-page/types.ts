import type { LoadedExtension } from '@/lib/electron';

export type ExtensionInfoPageProps = {
  extension: LoadedExtension | null;
  onClose: () => void;
};

export interface KeyValueRow {
  label: string;
  value: React.ReactNode;
}
