// Projects settings panel — list, create, edit, delete projects.
// Sessions auto-fall back to Inbox when their project is deleted (handled in main).

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useProjects } from '@/hooks/useProjects';
import { useSessions } from '@/hooks/useSessions';
import { useAiData } from '@/hooks/useAiData';
import { Button } from '@/components/ui';
import { SettingsCard, SettingsSection } from '../SettingsPrimitives';
import { useProjectActions } from '../projects/useProjectActions';
import { ProjectListItem } from '../projects/ProjectListItem';
import { ProjectEditDialog } from '../projects/ProjectEditDialog';
import type { Project } from '@/lib/electron';

export function ProjectsPanel() {
  const projects = useProjects();
  const sessions = useSessions();
  const aiData = useAiData();
  const [editing, setEditing] = useState<Project | 'new' | null>(null);

  const connections = aiData?.connections ?? [];
  const { sessionCount, connectionLabel, permissionLabel, handleDelete } = useProjectActions(
    sessions,
    connections,
  );

  if (projects === null) {
    return (
      <div className="mx-auto max-w-[760px] px-8 py-12 text-sm text-fg-subtle">
        Loading…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[760px] px-8 py-10">
      <SettingsSection
        title="Projects"
        subtitle="Group sessions by project. New sessions auto-assign by working directory."
      >
        <SettingsCard>
          {projects.length === 0 ? (
            <div className="px-4 py-6 text-sm text-fg-subtle">
              No projects yet. Sessions go to Inbox until you create one.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {projects.map((p) => (
                <ProjectListItem
                  key={p.id}
                  project={p}
                  sessionCount={sessionCount(p.id)}
                  connectionLabel={connectionLabel}
                  permissionLabel={permissionLabel}
                  onEdit={setEditing}
                  onDelete={handleDelete}
                />
              ))}
            </ul>
          )}
          <div className="border-t border-border px-4 py-3">
            <Button
              variant="outline"
              size="sm"
              icon={Plus}
              onClick={() => setEditing('new')}
            >
              New project
            </Button>
          </div>
        </SettingsCard>
      </SettingsSection>

      {editing && (
        <ProjectEditDialog
          project={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
