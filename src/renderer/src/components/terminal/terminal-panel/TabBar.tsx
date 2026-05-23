import { Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IconButton } from '@/components/ui';
import type { TerminalTabState } from './types';

interface TabBarProps {
  tabs:         TerminalTabState[];
  activeTabId:  string | null;
  onSelect:     (tabId: string) => void;
  onClose:      (tabId: string) => void;
  onNew:        () => void;
  onClosePanel: () => void;
}

export function TabBar({ tabs, activeTabId, onSelect, onClose, onNew, onClosePanel }: TabBarProps) {
  return (
    <div className="flex h-9 shrink-0 items-center border-b border-border bg-panel px-2 gap-1">
      {/* Tab chips + new tab button inline */}
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto scroll-thin">
        {tabs.map((tab) => (
          <TabChip
            key={tab.tabId}
            tab={tab}
            isActive={tab.tabId === activeTabId}
            onSelect={() => onSelect(tab.tabId)}
            onClose={() => onClose(tab.tabId)}
          />
        ))}
        {/* + sits immediately after the last tab, not at the far end */}
        <IconButton
          icon={Plus}
          label="New tab (Cmd+Shift+T)"
          onClick={onNew}
          className="shrink-0"
        />
      </div>

      {/* Close panel — hint the universal toggle shortcut */}
      <IconButton
        icon={X}
        label="Close terminal (Cmd+T)"
        onClick={onClosePanel}
        className="shrink-0"
      />
    </div>
  );
}

function TabChip({
  tab,
  isActive,
  onSelect,
  onClose,
}: {
  tab:      TerminalTabState;
  isActive: boolean;
  onSelect: () => void;
  onClose:  () => void;
}) {
  return (
    <div
      role="tab"
      aria-selected={isActive}
      onClick={onSelect}
      className={cn(
        'group flex h-7 max-w-40 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors',
        isActive
          ? 'bg-elevated-2 text-fg ring-1 ring-border-strong'
          : 'text-fg-muted hover:bg-elevated hover:text-fg',
        !tab.alive && 'opacity-60',
      )}
    >
      <span className="min-w-0 truncate">
        {tab.alive ? tab.title : `${tab.title} [exited]`}
      </span>
      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label={`Close ${tab.title}`}
        className={cn(
          'flex h-4 w-4 shrink-0 items-center justify-center rounded transition-opacity',
          isActive ? 'opacity-60 hover:opacity-100' : 'opacity-0 group-hover:opacity-60 hover:!opacity-100',
        )}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
