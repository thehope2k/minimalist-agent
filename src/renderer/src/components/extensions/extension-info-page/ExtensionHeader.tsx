import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { displayName } from '@/lib/extensions';
import { ExtensionAvatar } from '../ExtensionAvatar';
import { ExtensionMenu } from '../ExtensionMenu';
import type { LoadedExtension } from '@/lib/electron';

interface ExtensionHeaderProps {
  extension: LoadedExtension;
  copied: boolean;
  onCopySlug: () => void;
  onAfterDelete?: () => void;
}

export function ExtensionHeader({
  extension,
  copied,
  onCopySlug,
  onAfterDelete,
}: ExtensionHeaderProps) {
  return (
    <header className="flex h-10 shrink-0 items-center gap-3 border-b border-border px-4">
      <ExtensionAvatar extension={extension} size="sm" />
      <span className="truncate text-sm font-medium text-fg">
        {displayName(extension)}
      </span>
      <div className="flex-1" />
      <button
        type="button"
        onClick={onCopySlug}
        title="Copy slug to clipboard"
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-panel/40 px-2 py-1 font-mono text-[11px]',
          copied ? 'text-emerald-300' : 'text-fg-muted hover:bg-elevated hover:text-fg',
        )}
      >
        {copied ? (
          <Check className="h-3 w-3" strokeWidth={2} />
        ) : (
          <Copy className="h-3 w-3" strokeWidth={2} />
        )}{' '}
        {extension.slug}
      </button>
      <ExtensionMenu extension={extension} variant="header" onAfterDelete={onAfterDelete} />
    </header>
  );
}
