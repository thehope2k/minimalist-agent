import { ChevronRight, ChevronDown, Folder, FolderOpen, File as FileIcon, Copy, ExternalLink } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import type { FileTreeNode } from './types';

interface TreeNodeProps {
  node: FileTreeNode;
  depth: number;
  isExpanded: boolean;
  isSelected: boolean;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
  onDoubleClick: (path: string) => void;
  cwd?: string; // For computing relative paths
  highlightQuery?: string; // For highlighting matched text
}

export function TreeNode({
  node,
  depth,
  isExpanded,
  isSelected,
  onToggle,
  onSelect,
  onDoubleClick,
  cwd,
  highlightQuery,
}: TreeNodeProps) {
  const isDirectory = node.type === 'directory';
  const paddingLeft = 8 + depth * 12; // 8px base + 12px per level

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Highlight matched text in filename
  const renderHighlightedName = () => {
    if (!highlightQuery) return node.name;
    
    const lowerName = node.name.toLowerCase();
    const lowerQuery = highlightQuery.toLowerCase();
    const index = lowerName.indexOf(lowerQuery);
    
    if (index === -1) return node.name;
    
    const before = node.name.slice(0, index);
    const match = node.name.slice(index, index + highlightQuery.length);
    const after = node.name.slice(index + highlightQuery.length);
    
    return (
      <>
        {before}
        <span className="bg-accent/30 text-fg font-semibold">{match}</span>
        {after}
      </>
    );
  };

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [contextMenu]);

  // Close context menu on Esc
  useEffect(() => {
    if (!contextMenu) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenu(null);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [contextMenu]);

  const handleClick = () => {
    onSelect(node.absolutePath);
    if (isDirectory) {
      onToggle(node.absolutePath);
    }
  };

  const handleDoubleClick = () => {
    if (!isDirectory) {
      onDoubleClick(node.absolutePath);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleCopyAbsolute = () => {
    navigator.clipboard.writeText(node.absolutePath);
    setContextMenu(null);
  };

  const handleCopyRelative = () => {
    navigator.clipboard.writeText(node.relativePath);
    setContextMenu(null);
  };

  const handleReveal = () => {
    window.api.sessions.revealFile(node.absolutePath);
    setContextMenu(null);
  };

  return (
    <>
      <div
        className={cn(
          'flex h-7 cursor-pointer items-center gap-1 px-2 text-sm transition-colors',
          isSelected 
            ? 'border-l-2 border-accent bg-elevated-2 text-fg'
            : 'border-l-2 border-transparent text-fg hover:bg-elevated',
        )}
        style={{ paddingLeft: `${paddingLeft}px` }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
      >
        {/* Chevron for directories */}
        {isDirectory && (
          <span className="shrink-0">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-fg-muted" />
            ) : (
              <ChevronRight className="h-4 w-4 text-fg-muted" />
            )}
          </span>
        )}
        {/* Spacer for files (align with directories) */}
        {!isDirectory && <span className="h-4 w-4 shrink-0" />}

        {/* Icon */}
        <span className="shrink-0">
          {isDirectory ? (
            isExpanded ? (
              <FolderOpen className="h-4 w-4 text-fg-muted" />
            ) : (
              <Folder className="h-4 w-4 text-fg-muted" />
            )
          ) : (
            <FileIcon className="h-4 w-4 text-fg-subtle" />
          )}
        </span>

        {/* Name with highlighting */}
        <span className="min-w-0 flex-1 truncate">{renderHighlightedName()}</span>

        {/* Size (files only, show if <1MB) */}
        {!isDirectory && node.size && node.size < 1024 * 1024 && (
          <span className="shrink-0 text-xs text-fg-subtle">
            {formatSize(node.size)}
          </span>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 min-w-[180px] overflow-hidden rounded-lg border border-border bg-panel p-1 shadow-2xl"
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
        >
          <button
            onClick={handleCopyAbsolute}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-fg transition-colors hover:bg-elevated"
          >
            <Copy className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
            <span>Copy Absolute Path</span>
          </button>
          <button
            onClick={handleCopyRelative}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-fg transition-colors hover:bg-elevated"
          >
            <Copy className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
            <span>Copy Relative Path</span>
          </button>
          <div className="my-1 h-px bg-border" />
          <button
            onClick={handleReveal}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-fg transition-colors hover:bg-elevated"
          >
            <ExternalLink className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
            <span>Reveal in Finder</span>
          </button>
        </div>
      )}
    </>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
