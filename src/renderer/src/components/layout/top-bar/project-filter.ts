import type { Project } from '@/lib/electron';
import type { ProjectFilter } from './types';

export function projectFilterLabel(filter: ProjectFilter, projects: Project[]): string {
  if (filter === 'all') return 'All Projects';
  if (filter === 'inbox') return 'Inbox';
  return projects.find((p) => p.id === filter)?.name ?? 'Project';
}
