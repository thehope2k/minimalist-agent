// Re-export FileTreeNode from electron.d.ts for component use
export type { FileTreeNode } from '@/lib/electron';

/** Flattened tree item for virtual scrolling */
export interface FlatTreeNode {
  node: import('@/lib/electron').FileTreeNode;
  depth: number;
  index: number;
}

/** FileExplorerPanel props */
export interface FileExplorerPanelProps {
  cwd: string | undefined;
  sessionId: string | null;
  isOpen: boolean;
  onSelectFile: (absolutePath: string) => void;
  onClose: () => void;
}
