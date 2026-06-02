import { useCallback } from 'react';
import type { PermissionMode, Project } from '@/lib/electron';
import { deleteProject as deleteProjectStore } from '@/lib/projects';

type SessionListEntry = NonNullable<ReturnType<typeof import('@/hooks/useSessions').useSessions>>[number];
type Connection = NonNullable<ReturnType<typeof import('@/hooks/useAiData').useAiData>>['connections'][number];

/**
 * Helper functions for project actions and label formatting.
 */
export function useProjectActions(
  sessions: SessionListEntry[] | null,
  connections: Connection[],
) {
  const sessionCount = useCallback(
    (projectId: string): number =>
      (sessions ?? []).filter((s) => s.projectId === projectId).length,
    [sessions],
  );

  const connectionLabel = useCallback(
    (slug: string): string => {
      const c = connections.find((c) => c.slug === slug);
      return c ? c.name : `${slug} (removed)`;
    },
    [connections],
  );

  const permissionLabel = (mode: PermissionMode): string =>
    ({ plan: 'Plan', ask: 'Ask', auto: 'Auto' })[mode];

  const handleDelete = useCallback(
    async (proj: Project) => {
      const count = sessionCount(proj.id);
      const tail =
        count > 0
          ? `\n\n${count} session${count === 1 ? '' : 's'} will move to Inbox.`
          : '';
      if (!window.confirm(`Delete project "${proj.name}"?${tail}`)) return;
      await deleteProjectStore(proj.id);
    },
    [sessionCount],
  );

  return {
    sessionCount,
    connectionLabel,
    permissionLabel,
    handleDelete,
  };
}
