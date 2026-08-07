// Small "..." trigger + Copy/Reveal menu for file references rendered outside
// the File Explorer tree (markdown links, tool-call chips). Built on the
// existing Menu/Popover primitive per AGENTS.md — not a new context-menu
// implementation. TreeNode.tsx keeps its own right-click UX unchanged; this
// is additive, not a refactor of working code.

import { Copy, ExternalLink, MoreHorizontal } from 'lucide-react';
import { IconButton, Menu, type MenuItem } from '@/components/ui';
import { useFileOpener } from '@/contexts/FileOpenerContext';
import { createLogger } from '@/lib/logger';

const log = createLogger('file-ref-menu');

interface FileRefMenuProps {
  absolutePath: string;
  relativePath?: string;
  className?: string;
}

export function FileRefMenu({ absolutePath, relativePath, className }: FileRefMenuProps) {
  const fileOpener = useFileOpener();

  const handleReveal = () => {
    if (!fileOpener) return;
    // Stats first for a fast, accurate outcome message. sessions:revealFile
    // also validates server-side now, so this is defense-in-depth, not the
    // only gate.
    void fileOpener.revealInFinder(absolutePath).then((outcome) => {
      if (!outcome.ok) log.warn('reveal blocked:', outcome.reason);
    });
  };

  const items: MenuItem[] = [
    {
      label: 'Copy Absolute Path',
      icon: Copy,
      onSelect: () => void navigator.clipboard.writeText(absolutePath),
    },
    ...(relativePath
      ? [
          {
            label: 'Copy Relative Path',
            icon: Copy,
            onSelect: () => void navigator.clipboard.writeText(relativePath),
          } satisfies MenuItem,
        ]
      : []),
    {
      label: 'Reveal in Finder',
      icon: ExternalLink,
      onSelect: handleReveal,
    },
  ];

  return (
    <Menu
      trigger={<IconButton icon={MoreHorizontal} label="File options" size="sm" className={className} />}
      items={items}
      menuWidth={176}
    />
  );
}
