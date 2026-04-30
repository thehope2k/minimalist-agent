// A `<textarea>` with inline highlighting for `@…` mentions.
//
// Approach: native textarea on top, transparent text + visible caret.
// A character-aligned overlay div behind it renders the same content
// with `@token` segments wrapped in colored spans. Both share padding,
// font, line-height, letter-spacing — so the cursor and selection stay
// perfectly aligned.
//
// Style choice: highlight is **background color only** (no padding, no
// borders). Adding any inline padding to the overlay would shift the
// surrounding characters and desync the caret.

import { forwardRef, useEffect, useRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const MENTION_RE = /(^|\s)@([\w./-]+)/g;

/** Classes shared between the textarea and the overlay so widths align. */
const TYPO =
  'block w-full px-4 pt-3.5 pb-2 text-sm leading-relaxed font-sans whitespace-pre-wrap break-words';

interface Props extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Always required — we drive the overlay from this. */
  value: string;
}

export const HighlightedTextarea = forwardRef<HTMLTextAreaElement, Props>(
  function HighlightedTextareaImpl({ value, onScroll, className, ...rest }, ref) {
    const overlayRef = useRef<HTMLDivElement | null>(null);

    // Sync overlay scroll with the textarea so multi-line text stays aligned.
    const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
      const ta = e.currentTarget;
      if (overlayRef.current) {
        overlayRef.current.scrollTop = ta.scrollTop;
        overlayRef.current.scrollLeft = ta.scrollLeft;
      }
      onScroll?.(e);
    };

    // Also sync on value change (e.g. paste), since the scroll handler
    // doesn't fire if the textarea grew its content but the user hasn't
    // interacted with the scrollbar yet.
    useEffect(() => {
      const overlay = overlayRef.current;
      if (!overlay) return;
      // The textarea's own scrollTop is the source of truth; we read it
      // via the parent's ref (or fall back to letting React paint and
      // syncing on next scroll).
    }, [value]);

    return (
      <div className="relative">
        <div
          ref={overlayRef}
          aria-hidden
          className={cn(
            // Sit behind the textarea, same metrics, no input.
            'pointer-events-none absolute inset-0 overflow-hidden text-fg',
            TYPO,
          )}
        >
          <Highlighted text={value} />
          {/* Trailing newline so wrapped lines don't get clipped at the
              bottom when content fits exactly. */}
          {'\n'}
        </div>
        <textarea
          ref={ref}
          value={value}
          onScroll={handleScroll}
          className={cn(
            // Real input on top — transparent text, visible caret.
            'relative resize-none bg-transparent text-transparent caret-fg outline-none',
            'placeholder:text-fg-subtle',
            'disabled:cursor-not-allowed',
            TYPO,
            className,
          )}
          {...rest}
        />
      </div>
    );
  },
);

/* ---------- highlight tokenizer ---------- */

function Highlighted({ text }: { text: string }) {
  const parts: Array<{ kind: 'text' | 'mention'; value: string }> = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  // Reset state since this is a /g regex.
  MENTION_RE.lastIndex = 0;
  while ((match = MENTION_RE.exec(text)) !== null) {
    const leading = match[1] ?? '';
    const tokenStart = match.index + leading.length;
    if (tokenStart > lastIdx) {
      parts.push({ kind: 'text', value: text.slice(lastIdx, tokenStart) });
    }
    parts.push({ kind: 'mention', value: '@' + match[2]! });
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < text.length) {
    parts.push({ kind: 'text', value: text.slice(lastIdx) });
  }

  return (
    <>
      {parts.map((p, i) =>
        p.kind === 'text' ? (
          <span key={i}>{p.value}</span>
        ) : (
          // Background-only highlight — adding padding would desync the
          // caret because the textarea above doesn't know about it.
          <span
            key={i}
            className="rounded-[3px] bg-accent/15 text-accent"
          >
            {p.value}
          </span>
        ),
      )}
    </>
  );
}
