import { LoaderCircle } from 'lucide-react';
import { Tooltip } from '@/components/ui';

export function RunningDot({ title }: { title: string }) {
  return (
    <Tooltip content={title}>
      <span className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center">
        <LoaderCircle className="absolute inset-0 h-4 w-4 animate-spin text-accent" strokeWidth={2} />
        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
      </span>
    </Tooltip>
  );
}
