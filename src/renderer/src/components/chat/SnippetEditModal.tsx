import { useEffect, useRef, useState } from 'react';
import { Button, Input, Field } from '@/components/ui';
import { detectLanguage, languageLabel } from '@/lib/language-detect';
import type { DraftAttachment } from '@/lib/electron';

type Props = {
  attachment: DraftAttachment;
  onSave: (updated: DraftAttachment) => void;
  onClose: () => void;
};

/**
 * Full-screen edit modal for a snippet draft attachment.
 * Edits name + content; re-detects language on save.
 */
export function SnippetEditModal({ attachment, onSave, onClose }: Props) {
  const [name, setName] = useState(attachment.name);
  const [content, setContent] = useState(attachment.text ?? '');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSave = () => {
    const trimmed = content;
    const lang = detectLanguage(trimmed);
    const lineCount = trimmed.split('\n').length;
    const bytes = new TextEncoder().encode(trimmed).length;
    onSave({
      ...attachment,
      name: name.trim() || attachment.name,
      text: trimmed,
      language: lang,
      lineCount,
      size: bytes,
    });
  };

  const badge = languageLabel(detectLanguage(content));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Edit ${attachment.name}`}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-8"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-panel shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <div className="flex-1">
            <Field label="Filename">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-7 text-xs"
              />
            </Field>
          </div>
          <span className="mt-5 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent">
            {badge}
          </span>
        </div>

        {/* Content editor */}
        <div className="flex-1 overflow-hidden">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            spellCheck={false}
            className={[
              'h-full w-full resize-none bg-transparent p-4',
              'font-mono text-xs leading-relaxed text-fg outline-none',
              'placeholder:text-fg-subtle',
            ].join(' ')}
            style={{ minHeight: '320px' }}
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
          <span className="text-[10px] text-fg-subtle">
            {content.split('\n').length} lines · Esc to cancel
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={handleSave}>Save</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
