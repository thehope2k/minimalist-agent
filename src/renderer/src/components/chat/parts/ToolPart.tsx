import { TodoListPart } from './TodoListPart';
import { DiffPart } from './DiffPart';
import { ChipBody } from './tool-part/ChipBody';
import { parseDiffInput } from './diff-utils';
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
  // Tool-name casing can vary, so compare case-insensitively to ensure each
  // built-in tool reaches its dedicated renderer.
  const lowerName = props.name.toLowerCase();
  
  if (lowerName === 'todowrite') {
    return <TodoListPart input={props.input} />;
  }
  
  // Edit / Write get a side-by-side code diff instead of the JSON-chip view —
  // raw `old_string` / `new_string` blobs are unreadable in pre-text form.
  //
  // A finalized (done/error) call with no diff ever parseable means the tool
  // args were malformed and never touched disk — show that via ChipBody's
  // real error/raw-input instead of DiffPart's permanent loading placeholder.
  if (lowerName === 'edit' || lowerName === 'write') {
    const isFinal = props.status !== 'running';
    const canRenderDiff = !isFinal || parseDiffInput(props.name, props.input) !== null;
    if (canRenderDiff) {
      return (
        <DiffPart
          name={props.name}
          input={props.input}
          result={props.result}
          status={props.status}
          contextDelta={props.contextDelta}
          contextDeltaGroupSize={props.contextDeltaGroupSize}
        />
      );
    }
    return <ChipBody {...props} />;
  }
  
  return <ChipBody {...props} />;
}
