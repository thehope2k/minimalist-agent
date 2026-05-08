import { useEffect, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { ChevronRight, File as FileIcon, FileCode, FileText, Folder, Info } from 'lucide-react';
import { Button } from '../ui';
import { cn } from '@/lib/utils';
import { updateSessionMeta } from '@/lib/sessions';
import type { SessionFileNode } from '@/lib/electron';
import type { ChatMessage } from '@/lib/chat';

type Props = {
  sessionId: string | null;
  /** Current title (read from session meta upstream). */
  title: string;
  /** Current conversation — used for the session-usage row. */
  messages: ChatMessage[];
};

/** Per-level horizontal indent. */
const INDENT_PX = 16;
/** Guide-line offset within an indent level, aligned roughly under the
 *  parent chevron-tip so the line appears to "drop" from the folder icon. */
const GUIDE_OFFSET_PX = 12;

export function SessionInfoButton({ sessionId, title, messages }: Props) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<SessionFileNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title);

  // Refresh on every open so the tree stays current with newly stored
  // attachments — cheap, the dir is small.
  useEffect(() => {
    if (!open || !sessionId) return;
    setDraftTitle(title);
    setLoading(true);
    let alive = true;
    void window.api.sessions.listFiles(sessionId).then((tree) => {
      if (!alive) return;
      setFiles(tree);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [open, sessionId, title]);

  const commitTitle = async () => {
    const next = draftTitle.trim();
    if (!sessionId || !next || next === title) return;
    await updateSessionMeta(sessionId, { title: next });
  };

  const reveal = () => {
    if (sessionId) void window.api.sessions.revealInFolder(sessionId);
  };

  const disabled = !sessionId;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button
          variant="outline"
          size="sm"
          icon={Info}
          disabled={disabled}
          className="text-fg-muted hover:text-fg"
        >
          Info
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          side="top"
          sideOffset={8}
          collisionPadding={12}
          className="z-50 w-[420px] overflow-hidden rounded-xl border border-border bg-panel p-4 shadow-2xl"
        >
          {/* Title editor */}
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
            Title
          </label>
          <input
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            onBlur={() => void commitTitle()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') setDraftTitle(title);
            }}
            className="w-full rounded-md border border-border bg-elevated/40 px-2.5 py-2 text-sm text-fg outline-none focus:border-border-strong"
          />

          {/* Session usage — exact totals reported by the API. */}
          <UsageSection messages={messages} />

          {/* Files header */}
          <div className="mt-4 mb-1 flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
              Session Files
            </span>
            <button
              onClick={reveal}
              className="text-xs text-fg-muted hover:text-fg hover:underline"
            >
              View in Finder
            </button>
          </div>

          <div className="scroll-thin max-h-72 overflow-y-auto pr-1">
            {loading ? (
              <div className="py-4 text-center text-xs text-fg-subtle">Loading…</div>
            ) : files.length === 0 ? (
              <div className="py-4 text-center text-xs text-fg-subtle">
                No files yet. Attachments and tool outputs will appear here.
              </div>
            ) : (
              <Tree nodes={files} depth={0} />
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
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

const CODE_EXTS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'h',
  'json', 'yaml', 'yml', 'toml', 'sh', 'bash', 'zsh', 'sql', 'html',
  'css', 'scss', 'md', 'txt', 'log', 'conf', 'ini', 'cfg', 'env',
]);
const PDF_EXTS = new Set(['pdf']);
const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']);

function fileExt(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? '';
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
  // Snippets and text attachments can be previewed in-app.
  const canPreview = isInAttachments && isCode;

  const handleClick = () => {
    if (canPreview) {
      if (preview !== null) { setPreview(null); return; }
      void window.api.attachments.readAsBase64(node.path).then((b64) => {
        if (b64) setPreview(atob(b64));
      });
    } else {
      void window.api.sessions.revealFile(node.path);
    }
  };

  const Icon = isPdf ? FileText : isCode ? FileCode : FileIcon;
  const iconClass = isCode && isInAttachments
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
        {isImage && (
          <span className="text-[10px] text-fg-subtle">image</span>
        )}
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

/**
 * Exact token usage for the session — sums the per-turn `usage` numbers
 * Anthropic returns on every `result` message. No estimation.
 */
function UsageSection({ messages }: { messages: ChatMessage[] }) {
  let inputTotal = 0;
  let outputTotal = 0;
  let cacheReadTotal = 0;
  let cacheWriteTotal = 0;
  let turns = 0;
  for (const m of messages) {
    if (m.role !== 'assistant' || !m.usage) continue;
    turns++;
    inputTotal += m.usage.inputTokens ?? 0;
    outputTotal += m.usage.outputTokens ?? 0;
    cacheReadTotal += m.usage.cacheReadInputTokens ?? 0;
    cacheWriteTotal += m.usage.cacheCreationInputTokens ?? 0;
  }
  if (turns === 0) return null;

  return (
    <div className="mt-4">
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
        Session Usage
      </div>
      <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-elevated/30 p-2.5 text-xs text-fg-muted">
        <UsageRow label="Input tokens" value={inputTotal} />
        <UsageRow label="Output tokens" value={outputTotal} />
        {cacheReadTotal > 0 && (
          <UsageRow label="Cache reads" value={cacheReadTotal} />
        )}
        {cacheWriteTotal > 0 && (
          <UsageRow label="Cache writes" value={cacheWriteTotal} />
        )}
        <UsageRow label="Turns" value={turns} />
      </div>
    </div>
  );
}

function UsageRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-fg-subtle">{label}</span>
      <span className="font-mono text-fg">{value.toLocaleString()}</span>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
