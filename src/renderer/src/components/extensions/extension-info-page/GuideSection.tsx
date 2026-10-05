import { Markdown } from '../../chat/parts/markdown/Markdown';
import type { LoadedExtension } from '@/lib/electron';
import { CwdContext } from '@/contexts/CwdContext';
import { FileOpenerProvider } from '@/contexts/FileOpenerContext';
import { EditButton } from '@/components/ui';
import { Section } from './shared';

interface GuideSectionProps {
  extension: LoadedExtension;
  onOpenFile: (absolutePath: string, lineNumber: number) => void;
  onEdit?: () => void;
}

export function GuideSection({ extension, onOpenFile, onEdit }: GuideSectionProps) {
  return (
    <Section title="Guide" action={onEdit && <EditButton onClick={onEdit} />}>
      <div className="markdown px-4 py-4">
        <CwdContext.Provider value={extension.path}>
          <FileOpenerProvider onOpenFile={onOpenFile}>
            <Markdown text={extension.guideBody} />
          </FileOpenerProvider>
        </CwdContext.Provider>
      </div>
    </Section>
  );
}
