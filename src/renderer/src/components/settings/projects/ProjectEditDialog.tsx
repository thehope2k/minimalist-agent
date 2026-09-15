import { ProjectEditForm } from './project-edit-dialog/ProjectEditForm';
import type { ProjectEditDialogProps } from './types';

/** Edit/create project dialog (inline modal). */
export function ProjectEditDialog({ project, onClose }: ProjectEditDialogProps) {
  const isNew = project === null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col rounded-lg border border-border bg-panel shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="shrink-0 px-5 pt-5 text-base font-semibold text-fg">
          {isNew ? 'New project' : `Edit ${project.name}`}
        </h3>
        <ProjectEditForm project={project} onClose={onClose} />
      </div>
    </div>
  );
}
