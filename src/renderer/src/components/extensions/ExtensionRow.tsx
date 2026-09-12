import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DragHandle, type DragHandleProps } from '@/components/ui';
import { displayDescription, displayName, hasCredentials, isMcpBacked } from '@/lib/extensions';
import { ExtensionAvatar } from './ExtensionAvatar';
import { ExtensionMenu } from './ExtensionMenu';
import { McpStatusBadge } from './McpStatusBadge';
import type { LoadedExtension } from '@/lib/electron';
import type { McpStatus } from './mcpStatus';

type Props = {
  ext: LoadedExtension;
  active: boolean;
  dragHandle: DragHandleProps;
  mcpStatus: McpStatus | undefined;
  onClick: () => void;
  onAfterDelete: () => void;
};

export function ExtensionRow({
  ext,
  active,
  dragHandle,
  mcpStatus,
  onClick,
  onAfterDelete,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="group/ext relative border-b border-border last:border-b-0">
      {active && (
        <span className="absolute inset-y-2 left-0 z-10 w-0.5 rounded-r-sm bg-accent" />
      )}
      <div className="flex items-stretch">
        <div className="flex w-5 shrink-0 items-center justify-center">
          <DragHandle
            dragHandle={dragHandle}
            className="opacity-50 transition-opacity hover:opacity-100 group-hover/ext:opacity-100"
          />
        </div>
        <button
          onClick={onClick}
          className={cn(
            'flex min-w-0 flex-1 items-start gap-3 py-2.5 pr-3 pl-1 text-left transition-colors',
            active ? 'bg-elevated' : 'hover:bg-elevated/60',
          )}
        >
          <ExtensionAvatar extension={ext} size="md" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="truncate text-[0.95rem] font-medium text-fg">
                {displayName(ext)}
              </div>
              {isMcpBacked(ext) && (
                <span className="rounded bg-elevated-2 px-1.5 py-px font-mono text-[10px] uppercase tracking-wide text-fg-muted">
                  MCP
                </span>
              )}
              {hasCredentials(ext) && (
                <span title="This extension stores a key">
                  <KeyRound
                    className="h-3 w-3 shrink-0 text-fg-subtle"
                    strokeWidth={1.75}
                    aria-label="This extension stores a key"
                  />
                </span>
              )}
              <McpStatusBadge status={mcpStatus} />
            </div>
            <div className="mt-0.5 truncate text-xs text-fg-subtle">
              {displayDescription(ext)}
            </div>
          </div>
        </button>
      </div>

      <div
        className={cn(
          'absolute right-2 top-2 transition-opacity',
          'opacity-0 group-hover/ext:opacity-100',
          menuOpen && 'opacity-100',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <ExtensionMenu
          extension={ext}
          onAfterDelete={onAfterDelete}
          onOpenChange={setMenuOpen}
        />
      </div>
    </div>
  );
}
