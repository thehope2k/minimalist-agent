import { useMemo } from 'react';
import type { LoadedExtension } from '@/lib/electron';
import { Section } from './shared';

export function ConfigSection({ extension }: { extension: LoadedExtension }) {
  const configJson = useMemo(
    () => JSON.stringify(extension.config, null, 2),
    [extension.config],
  );

  return (
    <Section title="extension.json">
      <div className="px-4 py-3">
        <pre className="scroll-thin overflow-x-auto font-mono text-[12px] leading-relaxed text-fg">
          {configJson}
        </pre>
      </div>
    </Section>
  );
}
