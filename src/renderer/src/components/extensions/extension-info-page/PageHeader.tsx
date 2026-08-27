import { displayDescription, displayName, hasCredentials, isMcpBacked } from '@/lib/extensions';
import { ExtensionAvatar } from '../ExtensionAvatar';
import type { LoadedExtension } from '@/lib/electron';

const TAG_CLASS =
  'inline-block rounded bg-elevated-2 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-fg-muted';

export function PageHeader({ extension }: { extension: LoadedExtension }) {
  return (
    <div className="flex items-start gap-3">
      <ExtensionAvatar extension={extension} size="lg" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold text-fg">{displayName(extension)}</h1>
          {isMcpBacked(extension) && <span className={TAG_CLASS}>MCP</span>}
          {hasCredentials(extension) && (
            <span className={TAG_CLASS} title="This extension stores a key">
              Key
            </span>
          )}
        </div>
        <p className="mt-0.5 text-sm text-fg-muted">
          {displayDescription(extension)}
        </p>
      </div>
    </div>
  );
}
