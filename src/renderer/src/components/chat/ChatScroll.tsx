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
    // `relative` so the floating button positions against this container,
    // not the page. `min-h-0 flex-1` lets it actually shrink inside the
    // chat column's flex layout (otherwise it'd push the composer off).
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="scroll-thin h-full overflow-y-auto overscroll-contain"
      >
        {children}
      </div>

      {/* Floating scroll buttons — anchored to the right edge of the content
          column (max-w-240, centred) rather than the panel edge. This keeps
          them visually adjacent to messages regardless of how wide the panel
          is or how far the sidebar is dragged. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10">
        <div className="mx-auto flex w-full max-w-240 justify-end px-4">
          <div className="flex flex-col items-end gap-1.5">
            <div
              className={cn(
                'transition-opacity duration-150',
                atTop ? 'opacity-0' : 'opacity-100',
              )}
              aria-hidden={atTop}
            >
              <IconButton
                icon={ArrowUp}
                label="Scroll to top"
                onClick={scrollToTop}
                disabled={atTop}
                className="pointer-events-auto rounded-full border border-border bg-panel shadow-md hover:bg-elevated"
              />
            </div>
            <div
              className={cn(
                'transition-opacity duration-150',
                atBottom ? 'opacity-0' : 'opacity-100',
              )}
              aria-hidden={atBottom}
            >
              <IconButton
                icon={ArrowDown}
                label="Scroll to latest"
                onClick={scrollToBottom}
                disabled={atBottom}
                className="pointer-events-auto rounded-full border border-border bg-panel shadow-md hover:bg-elevated"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
