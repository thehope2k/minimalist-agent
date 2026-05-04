// Scrollable container for the message list with two coupled behaviours:
//
//   1. Land-at-bottom on session open/switch
//      Messages arrive asynchronously after `sessionId` changes, so a
//      one-shot `useEffect([sessionId])` that snaps `scrollTop = scrollHeight`
//      runs against an empty list and is a no-op. Instead we arm a
//      `pendingBottomJumpRef` on session change and consume it the first
//      time content actually has height.
//
//   2. Stick-to-bottom while streaming
//      If the user is already pinned near the bottom, follow new tokens.
//      If they scrolled up to read history, leave them alone.
//
//   3. Floating "go to top" button
//      Telegram-style: shows once you've scrolled meaningfully away from
//      the top, jumps back to the very first message on click.

import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { IconButton } from '../ui';
import { cn } from '@/lib/utils';

/** Pixels from bottom under which we consider the user "pinned". */
const STICK_THRESHOLD = 80;
/** Pixels from top above which the "go to top" button appears. */
const TOP_BUTTON_THRESHOLD = 320;

type Props = {
  /** Used to detect session switches so we know to re-anchor. */
  sessionId: string | null;
  /**
   * Cheap proxy for "rendered content changed": pass `messages.length`
   * combined with the last bubble's text length so streaming tokens
   * trigger the stick-to-bottom effect.
   */
  contentSignal: number;
  children: React.ReactNode;
};

export function ChatScroll({ sessionId, contentSignal, children }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  /** True when we're (still) following live content at the bottom. */
  const stickRef = useRef(true);
  /**
   * Set when the session changes. The next time the scroll container has
   * height > viewport, we snap to the bottom and clear the flag — so
   * switching to a long history lands at the latest message no matter
   * how late the data arrives.
   */
  const pendingBottomJumpRef = useRef(true);

  const [atTop, setAtTop] = useState(true);
  const [atBottom, setAtBottom] = useState(true);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickRef.current = distanceFromBottom < STICK_THRESHOLD;
    setAtTop(el.scrollTop < TOP_BUTTON_THRESHOLD);
    setAtBottom(distanceFromBottom < STICK_THRESHOLD);
  };

  // Session change → arm the one-shot bottom jump. Don't try to scroll
  // here directly; messages haven't loaded yet.
  useEffect(() => {
    pendingBottomJumpRef.current = true;
    stickRef.current = true;
    setAtTop(true);
    setAtBottom(true);
  }, [sessionId]);

  // Content updates: either consume the pending bottom-jump, or follow
  // the stream if we're pinned.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    if (pendingBottomJumpRef.current) {
      // Wait until there's something to scroll past — otherwise the
      // jump runs on an empty list and we have to redo it.
      if (el.scrollHeight > el.clientHeight) {
        el.scrollTop = el.scrollHeight;
        pendingBottomJumpRef.current = false;
        // After the jump we're at the bottom → top button hidden.
        setAtTop(el.scrollTop < TOP_BUTTON_THRESHOLD);
      }
      return;
    }

    if (stickRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [contentSignal]);

  const scrollToTop = () => {
    const el = scrollRef.current;
    if (!el) return;
    // Once at the top, the user is clearly reading from the start —
    // don't auto-follow new tokens until they manually return.
    stickRef.current = false;
    el.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  };

  return (
    // `min-h-0 flex-1` lets this shrink inside the chat column's flex layout.
    // Flex-row so the arrow column sits beside the scroll area — never over it.
    <div className="flex min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="scroll-thin min-w-0 flex-1 overflow-y-auto overscroll-contain"
      >
        {children}
      </div>

      {/* Arrow column — a fixed-width strip beside (not over) the scroll area.
          Arrows fade in/out; the column always reserves its space so content
          never shifts when they appear or disappear. */}
      <div className="flex w-9 shrink-0 flex-col items-center justify-end gap-1.5 pb-3">
        <div
          className={cn(
            'transition-opacity duration-150',
            atTop ? 'pointer-events-none opacity-0' : 'opacity-100',
          )}
          aria-hidden={atTop}
        >
          <IconButton
            icon={ArrowUp}
            label="Scroll to top"
            onClick={scrollToTop}
            disabled={atTop}
            className="rounded-full border border-border bg-panel shadow-md hover:bg-elevated"
          />
        </div>
        <div
          className={cn(
            'transition-opacity duration-150',
            atBottom ? 'pointer-events-none opacity-0' : 'opacity-100',
          )}
          aria-hidden={atBottom}
        >
          <IconButton
            icon={ArrowDown}
            label="Scroll to latest"
            onClick={scrollToBottom}
            disabled={atBottom}
            className="rounded-full border border-border bg-panel shadow-md hover:bg-elevated"
          />
        </div>
      </div>
    </div>
  );
}
