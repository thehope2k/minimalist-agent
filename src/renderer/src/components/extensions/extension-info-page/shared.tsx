import type { KeyValueRow } from './types';

export function KeyValueTable({ rows }: { rows: KeyValueRow[] }) {
  return (
    <div className="divide-y divide-border/40">
      {rows.map((r) => (
        <div
          key={r.label}
          className="grid grid-cols-[140px_1fr] items-start gap-3 px-4 py-2.5 text-sm"
        >
          <div className="text-fg-subtle">{r.label}</div>
          <div className="min-w-0 break-words text-fg">{r.value}</div>
        </div>
      ))}
    </div>
  );
}

export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2">
        <h2 className="text-sm font-semibold text-fg">{title}</h2>
      </div>
      <div className="overflow-hidden rounded-lg border border-border/50 bg-elevated/20">
        {children}
      </div>
    </section>
  );
}
