import { Button } from '@/components/ui';

interface PasteConfirmDialogProps {
  text:      string;
  onConfirm: () => void;
  onCancel:  () => void;
}

/**
 * Guards against pasting multi-line clipboard content straight into a live
 * shell — every line executes as its own command with no chance to review,
 * a classic footgun when the clipboard holds an LLM-generated snippet.
 */
export function PasteConfirmDialog({ text, onConfirm, onCancel }: PasteConfirmDialogProps) {
  const lineCount = text.split('\n').length;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onCancel} />
      <div className="fixed left-1/2 top-1/2 z-50 w-96 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-panel p-4 shadow-2xl">
        <div className="mb-2 text-sm font-medium text-fg">Paste {lineCount} lines?</div>
        <pre className="mb-3 max-h-32 overflow-auto whitespace-pre-wrap break-all rounded bg-elevated/60 p-2 font-mono text-xs text-fg-muted">
          {text}
        </pre>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" onClick={onConfirm}>Paste</Button>
        </div>
      </div>
    </>
  );
}
