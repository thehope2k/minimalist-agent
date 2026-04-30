import type { ConnectionMeta } from '@/lib/electron';

export type ConnectionKind =
  | 'claude-max'
  | 'chatgpt-plus'
  | 'github-copilot'
  | 'other'
  | 'local';

export interface FlowProps {
  onBack: () => void;
  onClose: () => void;
  onSaved: (c: ConnectionMeta) => void;
  /** Mark the new connection as the default. */
  makeDefault?: boolean;
  /**
   * When set, the form runs in "edit credential" mode: name + slug + models
   * are taken from this meta, only the credential is overwritten.
   */
  editingMeta?: ConnectionMeta;
}
