import { displayDescription, displayName } from '@/lib/extensions';
import { ExtensionAvatar } from '../ExtensionAvatar';
import type { LoadedExtension } from '@/lib/electron';
import { VARIANT_LABEL } from './types';

export function PageHeader({ extension }: { extension: LoadedExtension }) {
  return (
    <div className="flex items-start gap-3">
      <ExtensionAvatar extension={extension} size="lg" />
      <div className="min-w-0 flex-1">
        <h1 className="text-xl font-semibold text-fg">{displayName(extension)}</h1>
        <p className="mt-0.5 text-sm text-fg-muted">
          {displayDescription(extension)}
        </p>
        <div className="mt-2 inline-block rounded bg-elevated/80 px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-fg-subtle">
          {VARIANT_LABEL[extension.variant]}
        </div>
      </div>
    </div>
  );
}
