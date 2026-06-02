import { useState } from 'react';
import { ChevronRight, File as FileIcon, FileCode, FileText, Folder } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SessionFileNode } from '@/lib/electron';
import { CODE_EXTS, PDF_EXTS, IMAGE_EXTS, INDENT_PX, GUIDE_OFFSET_PX } from './types';

interface FileTreeProps {
  nodes: SessionFileNode[];
  loading: boolean;
}

export function FileTree({ nodes, loading }: FileTreeProps) {
  if (loading) {
    return (
      <div className="py-4 text-center text-xs text-fg-subtle">Loading…</div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="py-4 text-center text-xs text-fg-subtle">
        No files yet. Attachments and tool outputs will appear here.
      </div>
    );
  }

  return <Tree nodes={nodes} depth={0} />;
}

function Tree({ nodes, depth }: { nodes: SessionFileNode[]; depth: number }) {
  return (
    <div className="flex flex-col gap-0.5">
      {nodes.map((n) =>
        n.kind === 'dir' ? (
          <DirNode key={n.path} node={n} depth={depth} />
        ) : (
          <FileNode key={n.path} node={n} depth={depth} />
        ),
      )}
    </div>
  );
}

function DirNode({
  node,
  depth,
}: {
  node: Extract<SessionFileNode, { kind: 'dir' }>;
  depth: number;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs text-fg hover:bg-elevated"
        style={{ paddingLeft: 6 + depth * INDENT_PX }}
      >
        <ChevronRight
          className={cn(
            'h-3 w-3 shrink-0 text-fg-subtle transition-transform',
            open && 'rotate-90',
          )}
          strokeWidth={1.75}
        />
        <Folder className="h-3.5 w-3.5 shrink-0 text-fg-muted" strokeWidth={1.75} />
        <span className="truncate">{node.name}</span>
      </button>
      {open && node.children.length > 0 && (
        <div className="relative">
          {/* Vertical guide line aligned with the parent's chevron-tip. */}
          <span
            aria-hidden
            className="pointer-events-none absolute top-0 bottom-1 w-px bg-border"
            style={{ left: 6 + depth * INDENT_PX + GUIDE_OFFSET_PX }}
          />
          <Tree nodes={node.children} depth={depth + 1} />
        </div>
      )}
    </div>
  );
}

function FileNode({
  node,
  depth,
}: {
  node: Extract<SessionFileNode, { kind: 'file' }>;
  depth: number;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const ext = fileExt(node.name);
  const isCode = CODE_EXTS.has(ext);
  const isPdf = PDF_EXTS.has(ext);
  const isImage = IMAGE_EXTS.has(ext);
  const isInAttachments = node.path.includes('/attachments/');
  const canPreview = isInAttachments && isCode;

  const handleClick = () => {
    if (canPreview) {
      if (preview !== null) {
        setPreview(null);
        return;
      }
      void window.api.attachments.readAsBase64(node.path).then((b64) => {
        if (b64) setPreview(atob(b64));
      });
    } else {
      void window.api.sessions.revealFile(node.path);
    }
  };

  const Icon = isPdf ? FileText : isCode ? FileCode : FileIcon;
  const iconClass =
    isCode && isInAttachments
      ? 'h-3.5 w-3.5 shrink-0 text-accent'
      : 'h-3.5 w-3.5 shrink-0 text-fg-subtle';

  return (
    <div>
      <button
        onClick={handleClick}
        title={canPreview ? `Preview ${node.name}` : node.path}
        className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs text-fg hover:bg-elevated"
        style={{ paddingLeft: 6 + (depth + 1) * INDENT_PX }}
      >
        <Icon className={iconClass} strokeWidth={1.75} />
        <span className="truncate" style={{ flex: 1 }}>
          {node.name}
        </span>
        {canPreview && (
          <span className="text-[10px] text-accent/70">
            {preview !== null ? 'hide' : 'view'}
          </span>
        )}
        {!canPreview && !isImage && (
          <span className="text-[10px] text-fg-subtle">{formatSize(node.size)}</span>
        )}
        {isImage && <span className="text-[10px] text-fg-subtle">image</span>}
      </button>
      {preview !== null && (
        <div
          className="mx-2 mb-1 overflow-hidden rounded-md border border-border bg-elevated/50"
          style={{ marginLeft: 6 + (depth + 2) * INDENT_PX }}
        >
          <pre className="scroll-thin max-h-60 overflow-auto p-2.5 text-[11px] leading-relaxed text-fg-muted whitespace-pre">
            {preview}
          </pre>
        </div>
      )}
    </div>
  );
}

function fileExt(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
