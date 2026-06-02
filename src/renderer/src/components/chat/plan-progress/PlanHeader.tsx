import { ChevronDown, ChevronRight } from 'lucide-react';
import type { Plan } from '@/lib/electron';

interface PlanHeaderProps {
  plan: Plan;
  collapsed: boolean;
  onToggle: () => void;
}

export function PlanHeader({ plan, collapsed, onToggle }: PlanHeaderProps) {
  const completedCount = plan.phases.filter((p) => p.status === 'complete').length;

  return (
    <button
      onClick={onToggle}
      className="flex w-full items-center gap-2 px-3 py-2 hover:bg-elevated-1 transition-colors rounded-md group"
      aria-expanded={!collapsed}
      aria-label={collapsed ? 'Expand plan' : 'Collapse plan'}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="font-medium text-fg text-sm truncate">
          {plan.task.length > 50
            ? plan.task.substring(0, 50) + '...'
            : plan.task}
        </span>
        {plan.version > 1 && (
          <span className="text-xs px-1.5 py-0.5 rounded-full bg-accent/20 text-accent font-medium">
            v{plan.version}
          </span>
        )}
      </div>
      <span className="text-xs text-fg-muted font-mono tabular-nums">
        {completedCount}/{plan.phases.length}
      </span>
      {collapsed ? (
        <ChevronRight className="h-3.5 w-3.5 text-fg-subtle group-hover:text-fg transition-colors shrink-0" />
      ) : (
        <ChevronDown className="h-3.5 w-3.5 text-fg-subtle group-hover:text-fg transition-colors shrink-0" />
      )}
    </button>
  );
}
