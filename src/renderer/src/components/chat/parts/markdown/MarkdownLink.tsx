// `file:` links and bare paths (no scheme at all) get resolved+opened in-app
// (viewer or reveal-in-Finder) via fileOpener instead of being handed to
// shell.openExternal. `file:` survives sanitize only via the explicit
// allowance in markdown-sanitize-schema.ts — see that file for why it's safe
// despite `file:` being a blocked scheme for shell.openExternal itself
// (url-safety.ts remains the fallback gate if fileOpener is unavailable).
// Every genuine external scheme (http, mailto, vscode, ...) keeps the
// original openExternal path unchanged.

import { useEffect, useRef, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { defaultUrlTransform } from 'react-markdown';
import { createLogger } from '@/lib/logger';
import { useCwd } from '@/contexts/CwdContext';
import { useFileOpener } from '@/contexts/FileOpenerContext';
import { fileUrlToPath } from '@/lib/reference-resolver';
import { useTransientFeedback } from '@/hooks/useTransientFeedback';

const log = createLogger('markdown-link');

// True `scheme:` prefix, e.g. `https:`, `mailto:`, `file:`. A bare relative
// or absolute path (`SKILL.md`, `src/foo.ts`, `/Users/x/y`) has none of
// these, and `new URL(...)` on it throws rather than yielding a URL whose
// protocol we could classify — it is never a genuine external link.
const URL_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

export function MarkdownLink({ href, children }: { href?: string; children?: ReactNode }) {
  const [feedback, flash, dismiss] = useTransientFeedback();
  const cwd = useCwd();
  const fileOpener = useFileOpener();
  const wrapperRef = useRef<HTMLSpanElement>(null);

  // Dismiss the feedback tooltip on outside click / Escape, in addition to
  // its own auto-clear timeout — otherwise it lingers for the full timeout
  // even after the user has clearly moved on and clicked elsewhere.
  useEffect(() => {
    if (!feedback) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) dismiss();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [feedback, dismiss]);

  // No href at all (genuinely empty in the source markdown, e.g. `[text]()`),
  // or a href whose scheme react-markdown's own `defaultUrlTransform` refuses
  // to carry into a real DOM attribute (javascript:/data:/vbscript:/blob:/etc
  // — everything outside its hardcoded https?|ircs?|mailto|xmpp allowlist,
  // and *not* something we handle ourselves as a file reference below).
  // Render inert text rather than a real `<a target="_blank">` in either
  // case: a real anchor whose actual DOM href resolves to "" still has a
  // native click action that navigates to the *current page's own URL*,
  // which Electron's window-open handler then treats as a safe external
  // link and opens in the system browser — a broken-looking "link click
  // reopens the app's dev server URL in Chrome" bug that no JS-level
  // handler can prevent, since a modifier/middle-click bypasses our onClick
  // entirely and there's nothing left to classify at that point.
  const filePath = href ? fileUrlToPath(href) : null;
  const isFileReference = href != null && (filePath !== null || !URL_SCHEME_RE.test(href));
  const safeHref = href ? defaultUrlTransform(href) : '';

  if (!href || (!isFileReference && !safeHref)) {
    return <span className="text-fg-muted">{children}</span>;
  }

  const onClick = (e: ReactMouseEvent<HTMLAnchorElement>) => {
    if (isFileReference) {
      // `file:` links (and bare paths) have no meaningful new-tab/new-window
      // behavior, so unlike http(s) links, letting modifier/middle-clicks
      // fall through to the native target="_blank" handling would just
      // navigate to the resolved href — always intercept instead.
      e.preventDefault();
      if (fileOpener) {
        void fileOpener.openReference(href, cwd).then((outcome) => {
          if (!outcome.ok) flash(outcome.reason);
        });
      } else {
        openExternalWithFeedback(href);
      }
      return;
    }

    // Let modifier-clicks on genuine external links fall through to
    // setWindowOpenHandler (which also classifies).
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    openExternalWithFeedback(href);
  };

  function openExternalWithFeedback(url: string) {
    window.api.app.openExternal(url).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn('blocked:', msg);
      flash(msg);
    });
  }

  return (
    // `relative` + absolutely-positioned feedback keeps a failed-click message
    // from being spliced into the surrounding prose as inline text (it used to
    // sit as a flex sibling of the link, widening the line and breaking the
    // sentence mid-flow when the link wasn't at the end of a paragraph).
    <span ref={wrapperRef} className="relative inline-block">
      <a
        href={safeHref}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onClick}
        className="text-accent underline-offset-2 hover:underline"
      >
        {children}
      </a>
      {feedback && (
        <span
          role="status"
          className="absolute left-0 top-full z-10 mt-1 w-max max-w-xs rounded border border-border bg-panel px-2 py-1 text-xs text-fg-subtle shadow-lg"
        >
          {feedback}
        </span>
      )}
    </span>
  );
}
