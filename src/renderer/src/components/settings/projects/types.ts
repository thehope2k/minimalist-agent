import type { PermissionMode, Project } from '@/lib/electron';

export const COLOR_PALETTE = [
  '#4a90e2', // blue
  '#7c4dff', // purple
  '#22c55e', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#ec4899', // pink
  '#14b8a6', // teal
  '#94a3b8', // slate
];

export interface ProjectEditDialogProps {
  project: Project | null;
  onClose: () => void;
}

export interface ProjectListItemProps {
  project: Project;
  sessionCount: number;
  connectionLabel: (slug: string) => string;
  permissionLabel: (mode: PermissionMode) => string;
  onEdit: (p: Project) => void;
  onDelete: (p: Project) => void;
}
