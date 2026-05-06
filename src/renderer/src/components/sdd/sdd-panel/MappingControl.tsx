import { Select } from '@/components/ui';
import type { SddEntity, SddMapping } from '@/lib/sdd';

interface Props {
  currentMapping?: SddMapping;
  allEntities: SddEntity[];
  onMappingChange: (entityRootPath: string | null) => void;
}

export function MappingControl({ currentMapping, allEntities, onMappingChange }: Props) {
  return (
    <Select
      value={currentMapping?.entityRootPath ?? ''}
      onChange={(val) => {
        onMappingChange(val === '' ? null : val);
      }}
      options={[
        { value: '', label: '(unassign)' },
        ...allEntities.map((en) => ({ value: en.rootPath, label: en.name })),
      ]}
      className="text-xs h-6 py-0 max-w-32"
    />
  );
}
