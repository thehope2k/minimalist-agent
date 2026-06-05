import { useEffect } from 'react';
import { languageLabel } from '@/lib/language-detect';
import { CopyButton } from '@/components/ui';

interface SnippetPreviewModalProps {
  name: string;
  language: string;
  text: string | null;
  onClose: () => void;
}

/**
 * Full-screen snippet preview modal with syntax badge.
 */
export function SnippetPreviewModal({
  name,
  language,
  text,
  onClose,
}: SnippetPreviewModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={name}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-8"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-panel shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <span className="text-sm font-medium text-fg">{name}</span>
          <div className="flex items-center gap-2">
            {text !== null && (
              <CopyButton text={text} className="opacity-100" />
            )}
            <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent">
              {languageLabel(language)}
            </span>
          </div>
        </div>
        <div className="scroll-thin flex-1 overflow-auto">
          {text === null ? (
            <p className="p-4 text-xs text-fg-subtle">Loading…</p>
          ) : (
            <pre className="p-4 text-xs leading-relaxed text-fg-muted whitespace-pre-wrap break-all">
              {text}
            </pre>
          )}
        </div>
        <div className="border-t border-border px-4 py-2 text-right">
          <button
            onClick={onClose}
            className="text-xs text-fg-subtle transition-colors hover:text-fg-muted"
          >
            Close · Esc
          </button>
        </div>
      </div>
    </div>
  );
}
