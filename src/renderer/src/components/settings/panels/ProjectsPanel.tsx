// Projects settings panel — list, create, edit, delete projects.
// Sessions auto-fall back to Inbox when their project is deleted (handled in main).

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useProjects } from '@/hooks/useProjects';
import { useSessions } from '@/hooks/useSessions';
import { useAiData } from '@/hooks/useAiData';
import { Button, SortableList } from '@/components/ui';
import { reorderProjects } from '@/lib/projects';
import { SettingsCard, SettingsSection } from '../SettingsPrimitives';
import { useProjectActions } from '../projects/useProjectActions';
import { ProjectListItem } from '../projects/ProjectListItem';
import { ProjectEditDialog } from '../projects/ProjectEditDialog';
import type { Project } from '@/lib/electron';

const getProjectId = (project: Project): string => project.id;

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
        action={
          <Button
            variant="outline"
            icon={Plus}
            onClick={() => setEditing('new')}
            className="bg-elevated/40"
          >
            Add Project
          </Button>
        }
      >
        <SettingsCard>
          {projects.length === 0 ? (
            <div className="px-4 py-6 text-sm text-fg-subtle">
              No projects yet. Sessions go to Inbox until you create one.
            </div>
          ) : (
            <SortableList
              items={projects}
              getId={getProjectId}
              onReorder={(next) => void reorderProjects(next.map((project) => project.id))}
              className="divide-y divide-border"
              renderItem={(project, dragHandle) => (
                <ProjectListItem
                  project={project}
                  dragHandle={dragHandle}
                  sessionCount={sessionCount(project.id)}
                  connectionLabel={connectionLabel}
                  permissionLabel={permissionLabel}
                  onEdit={setEditing}
                  onDelete={handleDelete}
                />
              )}
            />
          )}
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
