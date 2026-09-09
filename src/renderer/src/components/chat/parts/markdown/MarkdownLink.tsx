// Three kinds of href, each with its own click handling:
//   - `#anchor`   — same-document heading link (TOC-style). Scrolled to
//                   in-page; never touches the fileOpener or shell.openExternal.
//   - file/bare path — resolved+opened in-app (viewer or reveal-in-Finder) via
//                   fileOpener. `file:` survives sanitize only via the explicit
//                   allowance in markdown-sanitize-schema.ts — see that file for
//                   why it's safe despite `file:` being a blocked scheme for
//                   shell.openExternal itself (url-safety.ts remains the
//                   fallback gate if fileOpener is unavailable).
//   - everything else — a genuine external scheme (http, mailto, vscode, ...),
//                   classified client-side before ever reaching shell.openExternal
//                   (see openExternalWithFeedback) so a dangerous/malformed URL
//                   never round-trips through IPC to produce Electron's raw
//                   "Error invoking remote method ..." wrapper text.

import { useEffect, useRef, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { defaultUrlTransform } from 'react-markdown';
import { createLogger } from '@/lib/logger';
import { useCwd } from '@/contexts/CwdContext';
import { useFileOpener } from '@/contexts/FileOpenerContext';
import { fileUrlToPath } from '@/lib/reference-resolver';
import { useTransientFeedback } from '@/hooks/useTransientFeedback';
import { classifyExternalUrl, formatBlockedUrlError } from '../../../../../../shared/url-safety';

const log = createLogger('markdown-link');

// True `scheme:` prefix, e.g. `https:`, `mailto:`, `file:`. A bare relative
// or absolute path (`SKILL.md`, `src/foo.ts`, `/Users/x/y`) has none of
// these, and `new URL(...)` on it throws rather than yielding a URL whose
// protocol we could classify — it is never a genuine external link.
const URL_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

/** Scrolls to the heading `id` a same-document `#anchor` link points at (rehype-slug assigns these). */
function scrollToAnchor(rawId: string): boolean {
  let id = rawId;
  try {
    id = decodeURIComponent(rawId);
  } catch (err) {
    log.debug('anchor id is not valid percent-encoding, using raw:', err);
  }
  const target = document.getElementById(id);
  if (!target) return false;
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return true;
}

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

  // Render inert text instead of a real <a target="_blank"> when href is
  // missing or unresolvable: a real anchor with an empty resolved href still
  // has a native click action that navigates to the *current page's own URL*,
  // which Electron's window-open handler then treats as a legitimate external
  // link and opens in the system browser. No JS-level onClick can prevent this
  // since modifier/middle-clicks bypass it entirely.
  const isAnchor = href != null && href.startsWith('#') && href.length > 1;
  const filePath = href ? fileUrlToPath(href) : null;
  const isFileReference =
    href != null && !isAnchor && (filePath !== null || !URL_SCHEME_RE.test(href));
  const safeHref = href ? defaultUrlTransform(href) : '';

  if (!href || (!isAnchor && !isFileReference && !safeHref)) {
    return <span className="text-fg-muted">{children}</span>;
  }

  const linkTitle = isAnchor ? undefined : isFileReference ? `Open: ${filePath ?? href}` : safeHref;

  const onClick = (e: ReactMouseEvent<HTMLAnchorElement>) => {
    if (isAnchor) {
      // Same-document heading link: always handled in-page, never a file
      // lookup or an external navigation.
      e.preventDefault();
      if (!scrollToAnchor(href.slice(1))) flash('Section not found in this document.');
      return;
    }

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

  // Classifies client-side first so a dangerous/malformed URL never makes the
  // round trip through `shell:openExternal` — that IPC handler throwing wraps
  // the message in Electron's own "Error invoking remote method ..." prefix,
  // which would otherwise leak straight into this feedback tooltip. The IPC
  // handler keeps the same check independently (url-safety.ts) as the actual
  // security boundary; this is purely to fail with a clean message.
  function openExternalWithFeedback(url: string) {
    const classification = classifyExternalUrl(url);
    if (classification.kind === 'dangerous') {
      const msg = formatBlockedUrlError(classification);
      log.warn('blocked:', msg);
      flash(msg);
      return;
    }
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
        title={linkTitle}
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
