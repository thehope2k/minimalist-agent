import { useMemo, useState } from 'react';
import { Check, Copy, Download, Link2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MessagePart } from '@/lib/chat';
import { saveSessionExport, shareSessionExport } from '@/lib/sessions';
import { recordSharedLink, type SharedLinkRecord } from '@/lib/shared-links';
import { renderMarkdown } from '@/lib/session-export/render-markdown';
import { extractConclusion, buildResponseHtml } from '@/lib/session-export/response-export';
import { ShareResultDialog } from '../session-export/ShareResultDialog';

type ExportAction = 'save' | 'share';
type ActionState = 'idle' | 'working' | 'done' | 'error';

export function ShareResponseButton({
  parts,
  sessionId,
  title,
}: {
  parts: MessagePart[];
  sessionId?: string;
  title?: string;
}) {
  const [copyState, setCopyState] = useState<'idle' | 'done' | 'error'>('idle');
  const [exportAction, setExportAction] = useState<ExportAction | null>(null);
  const [exportState, setExportState] = useState<ActionState>('idle');
  const [exportError, setExportError] = useState<string | null>(null);
  const [shared, setShared] = useState<SharedLinkRecord | null>(null);

  const conclusion = useMemo(() => extractConclusion(parts), [parts]);
  if (!conclusion) return null;

  const exportWorking = exportState === 'working';

  async function copy() {
    try {
      const html = await renderMarkdown(conclusion!);
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': new Blob([conclusion!], { type: 'text/plain' }),
          'text/html': new Blob([html], { type: 'text/html' }),
        }),
      ]);
      setCopyState('done');
      setTimeout(() => setCopyState('idle'), 1500);
    } catch {
      // Fall back to plain text if ClipboardItem write fails
      try {
        await navigator.clipboard.writeText(conclusion!);
        setCopyState('done');
      } catch {
        setCopyState('error');
      }
      setTimeout(() => setCopyState('idle'), 1500);
    }
  }

  async function runExport(action: ExportAction) {
    if (exportWorking) return;
    setExportAction(action);
    setExportState('working');
    setExportError(null);

    try {
      const { html, suggestedName } = await buildResponseHtml(conclusion!, title);
      if (action === 'save') {
        await saveSessionExport(html, suggestedName);
      } else {
        const result = await shareSessionExport(html, suggestedName);
        setShared(recordSharedLink(sessionId ?? '', 'response', result));
      }
      setExportState('done');
      setTimeout(() => setExportState('idle'), 1500);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Failed');
      setExportState('error');
      setTimeout(() => { setExportState('idle'); setExportError(null); }, 3500);
    }
  }

  return (
    <>
      <div className="flex items-center gap-1">
        {/* Copy — raw markdown, pastes with formatting in Teams / Slack / Notion */}
        <HoverButton
          icon={Copy}
          label={copyState === 'done' ? 'Copied' : copyState === 'error' ? 'Failed' : 'Copy'}
          done={copyState === 'done'}
          error={copyState === 'error'}
          working={false}
          disabled={false}
          onClick={() => void copy()}
          title="Copy as markdown — renders in Teams, Slack, Notion"
        />

        <span className="opacity-0 group-hover:opacity-100 text-fg-subtle/30 select-none text-[10px]">·</span>

        {/* Export cluster — Save to file and Share via BrewPage */}
        <HoverButton
          icon={Download}
          label={exportAction === 'save' && exportState === 'done' ? 'Saved' : 'Save .html'}
          done={exportAction === 'save' && exportState === 'done'}
          error={exportAction === 'save' && exportState === 'error'}
          working={exportAction === 'save' && exportWorking}
          disabled={exportWorking}
          onClick={() => void runExport('save')}
          title="Save response as HTML file"
        />
        <HoverButton
          icon={Link2}
          label={exportAction === 'share' && exportState === 'done' ? 'Shared' : 'Share'}
          done={exportAction === 'share' && exportState === 'done'}
          error={exportAction === 'share' && exportState === 'error'}
          working={exportAction === 'share' && exportWorking}
          disabled={exportWorking}
          onClick={() => void runExport('share')}
          title="Share response via BrewPage (unlisted link, expires in 15 days)"
        />

        {exportState === 'error' && exportError && (
          <span className="ml-1 max-w-48 truncate text-[10px] text-red-400" title={exportError}>
            {exportError}
          </span>
        )}
      </div>

      {shared && <ShareResultDialog record={shared} onClose={() => setShared(null)} />}
    </>
  );
}

function HoverButton({
  icon: Icon,
  label,
  done,
  working,
  error,
  disabled,
  onClick,
  title,
}: {
  icon: React.ElementType;
  label: string;
  done: boolean;
  working: boolean;
  error: boolean;
  disabled: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium',
        'transition-all duration-150 hover:bg-elevated hover:text-fg',
        'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
        done && 'opacity-100 text-emerald-400 hover:text-emerald-400',
        error && 'opacity-100 text-red-400 hover:text-red-400',
        !done && !error && 'text-fg-subtle',
        disabled && !working && 'cursor-not-allowed opacity-40',
      )}
    >
      {working ? (
        <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.75} />
      ) : done ? (
        <Check className="h-3 w-3" strokeWidth={2} />
      ) : (
        <Icon className="h-3 w-3" strokeWidth={1.75} />
      )}
      <span>{label}</span>
    </button>
  );
}
