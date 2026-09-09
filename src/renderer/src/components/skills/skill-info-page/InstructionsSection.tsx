import { Markdown } from '../../chat/parts/markdown/Markdown';
import type { LoadedSkill } from '@/lib/electron';
import { CwdContext } from '@/contexts/CwdContext';
import { FileOpenerProvider } from '@/contexts/FileOpenerContext';
import { EditButton } from './shared';

interface InstructionsSectionProps {
  skill: LoadedSkill;
  onEdit: () => void;
  disabled?: boolean;
  onOpenFile: (absolutePath: string, lineNumber: number) => void;
}

export function InstructionsSection({ skill, onEdit, disabled, onOpenFile }: InstructionsSectionProps) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-fg">Instructions</h2>
        <EditButton onClick={onEdit} disabled={disabled} />
      </div>
      <div className="overflow-hidden rounded-lg border border-border/50 bg-elevated/20">
        <div className="markdown px-4 py-4">
          <CwdContext.Provider value={skill.path}>
            <FileOpenerProvider onOpenFile={onOpenFile}>
              <Markdown text={skill.content} />
            </FileOpenerProvider>
          </CwdContext.Provider>
        </div>
      </div>
    </section>
  );
}
