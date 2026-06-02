import { Sparkles } from 'lucide-react';
import { SkillHeader } from './skill-info-page/SkillHeader';
import { PageHeader } from './skill-info-page/PageHeader';
import { MetadataSection } from './skill-info-page/MetadataSection';
import { PermissionModesSection } from './skill-info-page/PermissionModesSection';
import { InstructionsSection } from './skill-info-page/InstructionsSection';
import { useSkillActions } from './skill-info-page/useSkillActions';
import { EditSkillDialog } from './EditSkillDialog';
import type { SkillInfoPageProps } from './skill-info-page/types';

/**
 * Skill detail view — metadata, permissions, instructions.
 * Orchestrates skill actions (copy, edit) and edit dialog flow.
 */
export function SkillInfoPage({
  skill,
  onClose,
  onStartChatWithSubmission,
}: SkillInfoPageProps) {
  if (!skill) return <EmptyView />;

  const {
    mention,
    copied,
    editMode,
    copyMention,
    handleEdit,
    closeEditDialog,
  } = useSkillActions(skill, onStartChatWithSubmission);

  return (
    <div className="flex h-full flex-col">
      <SkillHeader
        skill={skill}
        mention={mention}
        copied={copied}
        onCopyMention={copyMention}
        onAfterDelete={onClose}
      />

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1100px] space-y-6 px-6 py-6">
          <PageHeader skill={skill} />

          <MetadataSection
            skill={skill}
            onEdit={() => handleEdit('metadata')}
            disabled={!onStartChatWithSubmission}
          />

          <PermissionModesSection alwaysAllow={skill.metadata.alwaysAllow ?? []} />

          <InstructionsSection
            skill={skill}
            onEdit={() => handleEdit('instructions')}
            disabled={!onStartChatWithSubmission}
          />
        </div>
      </div>

      {editMode && (
        <EditSkillDialog
          open
          mode={editMode}
          skill={skill}
          onClose={closeEditDialog}
          onSubmit={(submit) => onStartChatWithSubmission?.(submit)}
        />
      )}
    </div>
  );
}

function EmptyView() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-fg-subtle">
      <Sparkles className="h-6 w-6" strokeWidth={1.5} />
      <p className="text-sm">Select a skill to view its instructions</p>
    </div>
  );
}
