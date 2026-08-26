import { FolderOpen } from 'lucide-react';
import { revealInFinder } from '@/lib/skills';
import type { LoadedSkill } from '@/lib/electron';
import type { KeyValueRow } from './types';
import { EditButton, KeyValueTable, Mono } from './shared';

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
  const globs = skill.metadata.globs ?? [];
  return [
    { label: 'Slug', value: <Mono>{skill.slug}</Mono> },
    { label: 'Name', value: skill.metadata.name },
    { label: 'Description', value: skill.metadata.description },
    ...(globs.length > 0
      ? [{ label: 'File patterns', value: <Mono>{globs.join(', ')}</Mono> }]
      : []),
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


