// Small refreshable usage/quota chip shown beside the model picker. The gauge
// icon sets it apart from the context badge, which also shows a percentage.

import type { ReactNode } from 'react';
import { Gauge } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip } from './Tooltip';

type Props = {
  tooltip: string;
  onClick: () => void;
  disabled?: boolean;
  /** Border + text color classes (usage level / error tone). */
  tone: string;
  children: ReactNode;
};

export function UsagePill({ tooltip, onClick, disabled, tone, children }: Props) {
  return (
    <Tooltip content={tooltip}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cn(
          'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] leading-none tabular-nums transition-opacity cursor-pointer hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50',
          tone,
        )}
      >
        <Gauge className="h-2.5 w-2.5 shrink-0" strokeWidth={2} aria-hidden />
        <span>{children}</span>
      </button>
    </Tooltip>
  );
}
