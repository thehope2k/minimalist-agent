import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Shared portal overlay used by any component that needs an expand-to-
 * fullscreen experience (code blocks, diagrams, diff views, images, …).
 *
 * Handles the boilerplate that was being duplicated across the codebase:
 *  - createPortal to document.body (escapes overflow:hidden ancestors)
 *  - fixed inset-0 backdrop with blur + click-to-close
 *  - Escape key listener (capture phase, so it fires before chat shortcuts)
 *  - Standardised header bar with title + X close button
 *
 * `title` accepts a string (rendered in small-caps label style) or any
 * ReactNode for richer headers (e.g. DiffPart's icon + filename).
 *
 * The caller owns the content area — pass it as `children`. Wrap with
 * `overflow-auto` / `flex-1` as needed.
 */

export interface ExpandModalProps {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** Extra Tailwind classes on the inner dialog panel (e.g. to tweak max-width). */
  className?: string;
}

function isBackdropTarget(e: React.SyntheticEvent): boolean {
  return e.target === e.currentTarget;
}

export function ExpandModal({ title, onClose, children, className }: ExpandModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus the dialog on open so keyboard works immediately (Escape, arrow
  // keys, etc.) without requiring a mouse click. Child components that need
  // focus themselves (Monaco editors, inputs) will steal it after they mount.
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm titlebar-no-drag"
      onClick={(e) => isBackdropTarget(e) && onClose()}
      // Electron routes backdrop mousedowns to -webkit-app-region elements below the window too; stop it there only.
      onMouseDown={(e) => isBackdropTarget(e) && e.stopPropagation()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[90vh] w-[min(90vw,1200px)] flex-col overflow-hidden rounded-xl border border-border bg-panel shadow-2xl focus:outline-none',
          className,
        )}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-4 py-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {typeof title === 'string' ? (
              <span className="text-[11px] font-medium uppercase tracking-wide text-fg-subtle">
                {title}
              </span>
            ) : (
              title
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-fg-muted hover:bg-elevated hover:text-fg"
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
        {/* Content slot */}
        {children}
      </div>
    </div>,
    document.body,
  );
}
