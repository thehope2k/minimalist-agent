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

// Cap so a long paste can't grow the composer (and its toolbar above it)
// off-screen — the resting floor instead comes from the `rows` prop below.
const MAX_HEIGHT_PX = 240;

// Token syntax: plain `@word/path.ts` or backtick-quoted `@\`path with spaces\``.
// Backtick quoting is used whenever a file or folder name contains whitespace,
// since the regex boundary is whitespace and a quoted form makes the full path
// unambiguous without needing any escaping inside the token.
const MENTION_RE = /(^|\s)@(`[^`]+`|[\w./-]+)/g;

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
    const innerRef = useRef<HTMLTextAreaElement | null>(null);

    // MessageInput needs the real DOM node for focus/selection (mentions,
    // voice dictation) — useImperativeHandle would hide it, so mirror both.
    const setRefs = (node: HTMLTextAreaElement | null) => {
      innerRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = node;
    };

    // Sync overlay scroll with the textarea so multi-line text stays aligned.
    const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
      const ta = e.currentTarget;
      if (overlayRef.current) {
        overlayRef.current.scrollTop = ta.scrollTop;
        overlayRef.current.scrollLeft = ta.scrollLeft;
      }
      onScroll?.(e);
    };

    // Resting floor for auto-grow — captured once from the natural
    // `rows`-based height so short drafts don't lose that visual weight,
    // while longer ones still grow (capped at MAX_HEIGHT_PX, then scroll).
    const minHeightRef = useRef(0);
    useEffect(() => {
      const ta = innerRef.current;
      if (!ta) return;
      if (minHeightRef.current === 0) {
        // offsetHeight (rendered), not scrollHeight (content) — a restored
        // draft longer than `rows` would otherwise inflate the floor.
        minHeightRef.current = ta.offsetHeight;
      }
      ta.style.height = 'auto';
      const next = Math.min(
        Math.max(ta.scrollHeight, minHeightRef.current),
        MAX_HEIGHT_PX,
      );
      ta.style.height = `${next}px`;
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
          ref={setRefs}
          value={value}
          onScroll={handleScroll}
          style={{ maxHeight: MAX_HEIGHT_PX }}
          className={cn(
            // Real input on top — transparent text, visible caret.
            'relative resize-none overflow-y-auto bg-transparent text-transparent caret-fg outline-none',
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
