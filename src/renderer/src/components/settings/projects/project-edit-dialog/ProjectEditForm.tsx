import { useAiData } from '@/hooks/useAiData';
import { Button } from '@/components/ui';
import type { Project } from '@/lib/electron';
import { ProjectFormFields } from './ProjectFormFields';
import { useProjectEditForm } from './useProjectEditForm';

interface ProjectEditFormProps {
  project: Project | null;
  onClose: () => void;
}

export function ProjectEditForm({ project, onClose }: ProjectEditFormProps) {
  const connections = useAiData()?.connections ?? [];
  const form = useProjectEditForm(project, connections, onClose);
  const isNew = project === null;

  return (
    <>
      <div className="scroll-thin flex-1 overflow-y-auto px-5 py-4">
        <ProjectFormFields project={project} connections={connections} form={form} />
      </div>

      <div className="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-4">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => void form.save()}
          disabled={!form.canSave || form.busy}
        >
          {isNew ? 'Create' : 'Save'}
        </Button>
      </div>
    </>
  );
}
