import { Markdown } from '../../chat/parts/markdown/Markdown';
import type { LoadedExtension } from '@/lib/electron';
import { CwdContext } from '@/contexts/CwdContext';
import { FileOpenerProvider } from '@/contexts/FileOpenerContext';
import { Section } from './shared';

interface GuideSectionProps {
  extension: LoadedExtension;
  onOpenFile: (absolutePath: string, lineNumber: number) => void;
}

export function GuideSection({ extension, onOpenFile }: GuideSectionProps) {
  return (
    <Section title="Guide">
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
