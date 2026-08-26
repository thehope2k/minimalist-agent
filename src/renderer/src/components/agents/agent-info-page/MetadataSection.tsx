import type { LoadedAgent } from '@/lib/electron';
import type { KeyValueRow } from './types';
import { EditButton, KeyValueTable, Mono } from './shared';

interface MetadataSectionProps {
  agent: LoadedAgent;
  onEdit: () => void;
  disabled?: boolean;
}

export function MetadataSection({ agent, onEdit, disabled }: MetadataSectionProps) {
  const rows = buildMetadataRows(agent);

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

function buildMetadataRows(agent: LoadedAgent): KeyValueRow[] {
  return [
    { label: 'Name', value: agent.metadata.name },
    { label: 'Slug', value: <Mono>{agent.slug}</Mono> },
    {
      label: 'Description',
      value: agent.metadata.description || <span className="text-fg-subtle">—</span>,
    },
    {
      label: 'Model',
      value: agent.metadata.model || <span className="text-fg-subtle">default</span>,
    },
  ];
}
