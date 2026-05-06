import type { UnassignedSectionProps } from './types';
import { Select } from '@/components/ui';

function getBasename(p: string): string {
  return p.split('/').pop() ?? p;
}

export function UnassignedSection({
  unmappedServices,
  unmappedEntities,
  allEntities,
  onAssign,
}: UnassignedSectionProps) {
  if (unmappedServices.length === 0 && unmappedEntities.length === 0) return null;

  return (
    <div className="mt-2">
      <p className="text-xs font-semibold text-fg-subtle uppercase tracking-wide px-1 mb-1">
        Unassigned
      </p>

      {/* Unassigned service folders */}
      {unmappedServices.map((svcPath) => (
        <div
          key={svcPath}
          className="flex items-center gap-2 px-2 py-1.5 rounded border border-border mb-1"
        >
          <span className="text-xs text-fg flex-1 truncate">{getBasename(svcPath)}</span>
          <Select
            value=""
            onChange={(val) => {
              if (val) onAssign(svcPath, val);
            }}
            options={[
              { value: '', label: 'Assign spec…' },
              ...allEntities.map((en) => ({ value: en.rootPath, label: en.name })),
            ]}
            className="text-xs h-6 py-0"
          />
        </div>
      ))}

      {/* Unassigned entities */}
      {unmappedEntities.map((rootPath) => (
        <div
          key={rootPath}
          className="px-2 py-1.5 rounded border border-border mb-1"
        >
          <span className="text-xs text-fg-muted italic">{getBasename(rootPath)} — not mapped</span>
        </div>
      ))}
    </div>
  );
}
