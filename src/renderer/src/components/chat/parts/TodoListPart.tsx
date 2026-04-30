import { Circle, CircleDot, CheckCircle2, ListChecks } from 'lucide-react';
import { cn } from '@/lib/utils';

type TodoStatus = 'pending' | 'in_progress' | 'completed';

interface Todo {
  content: string;
  status: TodoStatus;
  activeForm?: string;
}

export function TodoListPart({ input }: { input: unknown }) {
  const todos = parseTodos(input);
  if (todos.length === 0) {
    // Nothing parseable — render a quiet placeholder so the chip still
    // tells the user *something* happened.
    return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-elevated/40 px-2.5 py-1.5 text-xs text-fg-subtle">
        <ListChecks className="h-3.5 w-3.5" strokeWidth={1.75} />
        <span>Updated todo list</span>
      </div>
    );
  }

  const done = todos.filter((t) => t.status === 'completed').length;

  return (
    <div className="overflow-hidden rounded-md border border-border bg-elevated/40 text-xs">
      <div className="flex items-center gap-2 border-b border-border/60 px-2.5 py-1.5">
        <ListChecks className="h-3.5 w-3.5 text-fg-muted" strokeWidth={1.75} />
        <span className="font-medium text-fg">Todos</span>
        <span className="ml-auto tabular-nums text-fg-subtle">
          {done}/{todos.length}
        </span>
      </div>
      <ul className="divide-y divide-border/50">
        {todos.map((t, i) => (
          <li
            key={i}
            className="flex items-start gap-2 px-2.5 py-1.5"
          >
            <StatusIcon status={t.status} />
            <span
              className={cn(
                'min-w-0 flex-1 break-words',
                t.status === 'completed'
                  ? 'text-fg-subtle line-through'
                  : t.status === 'in_progress'
                    ? 'text-fg'
                    : 'text-fg-muted',
              )}
            >
              {t.status === 'in_progress' && t.activeForm
                ? t.activeForm
                : t.content}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusIcon({ status }: { status: TodoStatus }) {
  if (status === 'completed') {
    return (
      <CheckCircle2
        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400"
        strokeWidth={2}
      />
    );
  }
  if (status === 'in_progress') {
    return (
      <CircleDot
        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent"
        strokeWidth={2}
      />
    );
  }
  return (
    <Circle
      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fg-subtle"
      strokeWidth={1.75}
    />
  );
}

function parseTodos(input: unknown): Todo[] {
  if (!input || typeof input !== 'object') return [];
  const list = (input as { todos?: unknown }).todos;
  if (!Array.isArray(list)) return [];
  const out: Todo[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const content = typeof o.content === 'string' ? o.content : '';
    if (!content) continue;
    const status = normalizeStatus(o.status);
    const activeForm =
      typeof o.activeForm === 'string' ? o.activeForm : undefined;
    out.push({ content, status, activeForm });
  }
  return out;
}

function normalizeStatus(raw: unknown): TodoStatus {
  if (raw === 'completed' || raw === 'in_progress' || raw === 'pending') {
    return raw;
  }
  return 'pending';
}
