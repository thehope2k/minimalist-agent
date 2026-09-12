import type { GitFileStatus } from '../types';

export const STATUS_STYLES: Record<GitFileStatus, {
  label: string;
  badgeClasses: string;
  nameClasses: string;
}> = {
  M: { label: 'M', badgeClasses: 'text-amber-400 bg-amber-500/15', nameClasses: 'text-amber-300' },
  A: { label: 'N', badgeClasses: 'text-emerald-400 bg-emerald-500/15', nameClasses: 'text-emerald-300' },
  D: { label: 'D', badgeClasses: 'text-red-400 bg-red-500/15', nameClasses: 'text-red-300 line-through' },
  R: { label: 'R', badgeClasses: 'text-blue-400 bg-blue-500/15', nameClasses: 'text-blue-300' },
  '?': { label: 'N', badgeClasses: 'text-emerald-400 bg-emerald-500/15', nameClasses: 'text-emerald-300' },
  U: { label: 'C', badgeClasses: 'text-orange-400 bg-orange-500/15', nameClasses: 'text-orange-300' },
};

export function repoLabel(root: string): string {
  return root.split('/').filter(Boolean).pop() ?? root;
}

export function shortenRoot(root: string): string {
  return root.replace(/^\/Users\/[^/]+\//, '~/');
}

export function splitPath(relativePath: string): { dir: string; name: string } {
  const lastSlash = relativePath.lastIndexOf('/');
  if (lastSlash === -1) return { dir: '', name: relativePath };
  return { dir: relativePath.slice(0, lastSlash + 1), name: relativePath.slice(lastSlash + 1) };
}
