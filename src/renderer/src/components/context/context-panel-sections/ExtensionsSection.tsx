import type { LoadedExtension } from '@/lib/electron';
import {
  displayName as extensionDisplayName,
  displayDescription as extensionDisplayDescription,
} from '@/lib/extensions';
import { ExtensionAvatar } from '@/components/extensions';
import { ItemRow } from './ItemRow';
import { NewAssetButton } from './NewAssetButton';

interface ExtensionsSectionProps {
  title?: string;
  extensions: LoadedExtension[];
  onOpenExtension: (extension: LoadedExtension) => void;
  onNew?: () => void;
}

export function ExtensionsSection({
  title = 'Extensions',
  extensions,
  onOpenExtension,
  onNew,
}: ExtensionsSectionProps) {
  if (extensions.length === 0 && !onNew) return null;

  return (
    <div className="border-b border-border pb-2 last:border-0">
      <div className="flex items-center gap-1.5 px-3 py-2">
        <span className="text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
          {title}
        </span>
        <span className="flex-1 text-[10px] tabular-nums text-fg-subtle">{extensions.length}</span>
        {onNew && <NewAssetButton label="New project extension" onClick={onNew} />}
      </div>
      {extensions.length === 0 && (
        <p className="px-3 pb-2 text-xs text-fg-subtle">No extensions yet.</p>
      )}
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
