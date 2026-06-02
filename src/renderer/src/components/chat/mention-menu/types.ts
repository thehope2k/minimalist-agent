import type {
  FileSearchEntry,
  LoadedExtension,
  LoadedSkill,
} from '@/lib/electron';

/** Discriminated union of pickable items. */
export type MentionItem =
  | { kind: 'skill'; skill: LoadedSkill }
  | { kind: 'extension'; extension: LoadedExtension }
  | { kind: 'file'; entry: FileSearchEntry };

export interface MentionMenuProps {
  open: boolean;
  query: string;
  skills: LoadedSkill[];
  /** Only enabled extensions are pickable — disabled ones can't act anyway. */
  extensions: LoadedExtension[];
  /** Working directory to search files under. Empty = no file results. */
  cwd?: string;
  onSelect: (item: MentionItem) => void;
  onClose: () => void;
}

export interface MentionMenuHandle {
  moveUp: () => void;
  moveDown: () => void;
  /** Returns true if a selection was made (signal to swallow the keystroke). */
  confirm: () => boolean;
}

export const FILES_LIMIT = 25;
export const FILE_SEARCH_DEBOUNCE_MS = 150;
