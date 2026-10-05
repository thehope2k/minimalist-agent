import type { SeedSubmit } from '@/App';
import type { LoadedExtension } from '@/lib/electron';

export type ExtensionInfoPageProps = {
  extension: LoadedExtension | null;
  onClose: () => void;
  onOpenFile: (absolutePath: string, lineNumber: number) => void;
  onStartChatWithSubmission?: (submit: SeedSubmit) => void;
};

export interface KeyValueRow {
  label: string;
  value: React.ReactNode;
}
