import { X } from 'lucide-react';
import { IconButton } from '@/components/ui';

interface BranchWarningsProps {
  warnings: string[];
  onDismiss: () => void;
}

export function BranchWarnings({ warnings, onDismiss }: BranchWarningsProps) {
  if (warnings.length === 0) return null;

  return (
    <div
      role="status"
      className="mx-4 mt-2 flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/15 px-3 py-2 text-sm text-amber-300"
    >
      <ul className="min-w-0 flex-1 space-y-0.5">
        {warnings.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
      <IconButton icon={X} label="Dismiss" onClick={onDismiss} />
    </div>
  );
}
