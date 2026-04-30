import { useEffect, useState } from 'react';
import { ChevronDown, Megaphone, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CHANGELOG, type ChangelogEntry } from '@/lib/changelog';

type Props = {
  onClose: () => void;
};

export function WhatsNewDialog({ onClose }: Props) {
  // Esc-to-close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-app/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(80vh,720px)] w-[min(640px,calc(100vw-32px))] flex-col overflow-hidden rounded-xl border border-border bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-border/60 px-4 py-3">
          <Megaphone className="h-4 w-4 text-accent" strokeWidth={1.75} />
          <h2 className="flex-1 text-sm font-medium text-fg">What's New</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-fg-subtle hover:bg-elevated hover:text-fg"
            aria-label="Close"
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </header>

        <div className="scroll-thin flex-1 overflow-y-auto">
          {CHANGELOG.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-fg-subtle">
              No release notes yet.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {CHANGELOG.map((entry, i) => (
                <ReleaseRow
                  key={entry.version}
                  entry={entry}
                  defaultOpen={i === 0}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function ReleaseRow({
  entry,
  defaultOpen,
}: {
  entry: ChangelogEntry;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-elevated/40"
      >
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-fg-subtle transition-transform',
            !open && '-rotate-90',
          )}
          strokeWidth={2}
        />
        <span className="rounded-md border border-border/60 bg-elevated/60 px-1.5 py-0.5 font-mono text-[11px] text-fg">
          v{entry.version}
        </span>
        {entry.intro && (
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">
            {entry.intro}
          </span>
        )}
        <span className="shrink-0 text-xs tabular-nums text-fg-subtle">
          {formatDate(entry.date)}
        </span>
      </button>
      {open && (
        <div className="space-y-4 px-12 pb-4 text-sm text-fg-muted">
          {entry.sections.map((section, si) => (
            <div key={si}>
              {section.heading && (
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-accent/80">
                  {section.heading}
                </h3>
              )}
              <div className="space-y-3">
                {section.groups.map((group, gi) => (
                  <div key={gi}>
                    {group.title && (
                      <h4 className="mb-1 text-xs font-medium text-fg">
                        {group.title}
                      </h4>
                    )}
                    <ul className="space-y-1.5">
                      {group.items.map((item, ii) => (
                        <li key={ii} className="flex gap-2 leading-relaxed">
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-fg-subtle" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </li>
  );
}

function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const [, y, mo, d] = m;
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  const monthName = months[Number(mo) - 1] ?? mo;
  return `${monthName} ${Number(d)}, ${y}`;
}
