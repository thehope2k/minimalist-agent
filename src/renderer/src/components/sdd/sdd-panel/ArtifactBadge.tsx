import { Badge } from '@/components/ui';

interface Props {
  label: string;
  done: boolean;
  tooltip?: string;
}

export function ArtifactBadge({ label, done, tooltip }: Props) {
  return (
    <span title={tooltip}>
      <Badge variant={done ? 'accent' : 'default'} className="text-[10px] px-1.5 py-0">
        {done ? `✓ ${label}` : `○ ${label}`}
      </Badge>
    </span>
  );
}
