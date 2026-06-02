export function SectionHeader({ label }: { label: string }) {
  return (
    <div className="sticky top-0 z-10 border-b border-border/60 bg-panel/95 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-fg-subtle backdrop-blur">
      {label}
    </div>
  );
}

export function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center py-9">
      <p className="text-xs text-fg-subtle">{children}</p>
    </div>
  );
}

export function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border/60 px-1 font-mono">{children}</kbd>
  );
}
