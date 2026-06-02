import { FolderOpen, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { revealInFinder } from '@/lib/skills';
import type { LoadedSkill } from '@/lib/electron';
import type { KeyValueRow } from './types';

interface MetadataSectionProps {
  skill: LoadedSkill;
  onEdit: () => void;
  disabled?: boolean;
}

export function MetadataSection({ skill, onEdit, disabled }: MetadataSectionProps) {
  const rows = buildMetadataRows(skill);

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-fg">Metadata</h2>
        <EditButton onClick={onEdit} disabled={disabled} />
      </div>
      <div className="overflow-hidden rounded-lg border border-border/50 bg-elevated/20">
        <KeyValueTable rows={rows} />
      </div>
    </section>
  );
}

function buildMetadataRows(skill: LoadedSkill): KeyValueRow[] {
  return [
    { label: 'Slug', value: <Mono>{skill.slug}</Mono> },
    { label: 'Name', value: skill.metadata.name },
    { label: 'Description', value: skill.metadata.description },
    {
      label: 'Location',
      value: (
        <button
          type="button"
          onClick={() => void revealInFinder(skill.path)}
          className="inline-flex items-center gap-1 text-fg-muted hover:text-fg"
          title="Reveal in Finder"
        >
          <Mono>{skill.path}</Mono>
          <FolderOpen className="h-3 w-3 shrink-0" strokeWidth={1.75} />
        </button>
      ),
    },
  ];
}

function Mono({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[12.5px]">{children}</span>;
}

function KeyValueTable({ rows }: { rows: KeyValueRow[] }) {
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

function EditButton({
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
