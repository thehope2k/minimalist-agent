import type { LoadedExtension } from '@/lib/electron';
import {
  displayName as extensionDisplayName,
  displayDescription as extensionDisplayDescription,
} from '@/lib/extensions';
import { ExtensionAvatar } from '@/components/extensions';
import { ItemRow } from './ItemRow';

interface ExtensionsSectionProps {
  title?: string;
  extensions: LoadedExtension[];
  onOpenExtension: (extension: LoadedExtension) => void;
}

export function ExtensionsSection({
  title = 'Extensions',
  extensions,
  onOpenExtension,
}: ExtensionsSectionProps) {
  if (extensions.length === 0) return null;

  return (
    <div className="border-b border-border pb-2 last:border-0">
      <div className="flex items-center gap-1.5 px-3 py-2">
        <span className="text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
          {title}
        </span>
        <span className="text-[10px] tabular-nums text-fg-subtle">{extensions.length}</span>
      </div>
      {extensions.map((extension) => (
        <ItemRow
          key={extension.slug}
          avatar={<ExtensionAvatar extension={extension} size="sm" />}
          name={extensionDisplayName(extension)}
          slug={extension.slug}
          description={extensionDisplayDescription(extension)}
          onOpen={() => onOpenExtension(extension)}
        />
      ))}
    </div>
  );
}
