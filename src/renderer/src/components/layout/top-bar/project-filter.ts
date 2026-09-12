import type { Project } from '@/lib/electron';
import type { ProjectFilter } from './types';

export function projectFilterLabel(filter: ProjectFilter, projects: Project[]): string {
  if (filter === 'all') return 'All Sessions';
  if (filter === 'inbox') return 'Unassigned';
  return projects.find((p) => p.id === filter)?.name ?? 'Project';
}
