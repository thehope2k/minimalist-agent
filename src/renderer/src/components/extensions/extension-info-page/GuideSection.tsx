import { Markdown } from '../../chat/parts/markdown/Markdown';
import type { LoadedExtension } from '@/lib/electron';
import { Section } from './shared';

export function GuideSection({ extension }: { extension: LoadedExtension }) {
  return (
    <Section title="Guide">
      <div className="markdown px-4 py-4">
        <Markdown text={extension.guideBody} />
      </div>
    </Section>
  );
}
