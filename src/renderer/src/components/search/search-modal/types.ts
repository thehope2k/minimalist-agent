import type { FileSearchEntry, ContentMatchEntry } from '@/lib/electron';

export interface SearchModalProps {
  cwd: string | undefined;
  onClose: () => void;
  onOpenFile: (absolutePath: string, lineNumber: number) => void;
}

export type SearchItem =
  | { kind: 'file'; entry: FileSearchEntry }
  | { kind: 'grep'; entry: ContentMatchEntry };

export const FILES_LIMIT = 20;
export const GREP_LIMIT = 60;
export const FILES_DEBOUNCE_MS = 150;
export const GREP_DEBOUNCE_MS = 250;
