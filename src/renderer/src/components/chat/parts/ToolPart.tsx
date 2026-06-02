import { TodoListPart } from './TodoListPart';
import { DiffPart } from './DiffPart';
import { ChipBody } from './tool-part/ChipBody';
import type { ToolPartProps } from './tool-part/types';

export type { ToolPartProps };

/**
 * Compact tool-call chip. One line by default; click to expand and see
 * full input + result. Errored tools auto-expand so the user doesn't
 * have to hunt for what broke.
 * 
 * Routes to specialized renderers for TodoWrite, Edit, and Write tools.
 * Generic tools use ChipBody.
 */
export function ToolPart(props: ToolPartProps) {
  // TodoWrite gets a dedicated checklist renderer — the default JSON-chip
  // view loses the structure of what's actually a list of tasks. We split
  // here (rather than branching inside `ChipBody`) so each branch's hook
  // call order stays stable across re-renders.
  // Tool names arrive in different cases depending on the backend
  // (Anthropic: `Write`/`Edit`/`TodoWrite`; Pi: `write`/`edit`).
  // Compare case-insensitively so both reach the dedicated renderers.
  const lowerName = props.name.toLowerCase();
  
  if (lowerName === 'todowrite') {
    return <TodoListPart input={props.input} />;
  }
  
  // Edit / Write get a side-by-side code diff instead of the JSON-chip view —
  // raw `old_string` / `new_string` blobs are unreadable in pre-text form.
  if (lowerName === 'edit' || lowerName === 'write') {
    return (
      <DiffPart
        name={props.name}
        input={props.input}
        result={props.result}
        status={props.status}
      />
    );
  }
  
  return <ChipBody {...props} />;
}
