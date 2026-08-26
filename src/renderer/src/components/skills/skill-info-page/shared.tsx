import { Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { KeyValueRow } from './types';

export function Mono({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[12.5px]">{children}</span>;
}

export function KeyValueTable({ rows }: { rows: KeyValueRow[] }) {
  return (
    <div className="divide-y divide-border/40">
      {rows.map((r) => (
        <div
          key={r.label}
          className="grid grid-cols-[140px_1fr] items-start gap-3 px-4 py-2.5 text-sm"
        >
          <div className="text-fg-subtle">{r.label}</div>
          <div className="min-w-0 wrap-break-word text-fg">{r.value}</div>
        </div>
      ))}
    </div>
  );
}

export function EditButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border border-border/60 bg-elevated/60 px-2 py-0.5 text-xs',
        disabled
          ? 'cursor-not-allowed text-fg-subtle opacity-50'
          : 'text-fg-muted hover:bg-elevated hover:text-fg',
      )}
    >
      <Pencil className="h-3 w-3" strokeWidth={1.75} /> Edit
    </button>
  );
}
