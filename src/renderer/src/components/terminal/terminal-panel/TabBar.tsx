import { useRef, useState } from 'react';
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
  onRename:     (tabId: string, customTitle: string | undefined) => void;
}

export function TabBar({ tabs, activeTabId, onSelect, onClose, onNew, onClosePanel, onRename }: TabBarProps) {
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
            onRename={(customTitle) => onRename(tab.tabId, customTitle)}
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
  onRename,
}: {
  tab:      TerminalTabState;
  isActive: boolean;
  onSelect: () => void;
  onClose:  () => void;
  onRename: (customTitle: string | undefined) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState('');
  const inputRef              = useRef<HTMLInputElement>(null);

  const displayTitle = tab.customTitle ?? tab.title;

  const startEdit = () => {
    setDraft(tab.customTitle ?? tab.title);
    setEditing(true);
    // Wait for input to mount before selecting all text.
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const commitEdit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    // Empty string → clear override so process-name tracking resumes.
    onRename(trimmed || undefined);
  };

  const cancelEdit = () => {
    setEditing(false);
  };

  return (
    <div
      role="tab"
      aria-selected={isActive}
      onClick={editing ? undefined : onSelect}
      onDoubleClick={editing ? undefined : startEdit}
      className={cn(
        'group flex h-7 max-w-40 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors',
        isActive
          ? 'bg-elevated-2 text-fg ring-1 ring-border-strong'
          : 'text-fg-muted hover:bg-elevated hover:text-fg',
        !tab.alive && 'opacity-60',
        editing && 'cursor-text ring-1 ring-border-strong bg-elevated-2 text-fg',
      )}
    >
      {editing ? (
        <input
          ref={inputRef}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter')  { e.preventDefault(); commitEdit(); }
            if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
            // Prevent global shortcuts (tab-switch arrows, Cmd+Shift+W) from
            // firing while the user is typing a new name.
            e.stopPropagation();
          }}
          onBlur={commitEdit}
          // Clicks inside the input must not bubble up to the div's onSelect.
          onClick={(e) => e.stopPropagation()}
          className="min-w-0 w-24 bg-transparent outline-none text-xs font-medium text-fg"
        />
      ) : (
        <span className="min-w-0 truncate">
          {tab.alive ? displayTitle : `${displayTitle} [exited]`}
        </span>
      )}

      {/* Hide the close button while editing so it can't be accidentally clicked */}
      {!editing && (
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          onDoubleClick={(e) => e.stopPropagation()}
          aria-label={`Close ${displayTitle}`}
          className={cn(
            'flex h-4 w-4 shrink-0 items-center justify-center rounded transition-opacity',
            isActive ? 'opacity-60 hover:opacity-100' : 'opacity-0 group-hover:opacity-60 hover:!opacity-100',
          )}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
