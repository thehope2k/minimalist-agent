/**
 * Normalize Pi tool argument shapes to the field names the UI expects.
 * This keeps runtime-specific shapes out of the renderer.
 *
 *   Pi `path`              ↔ UI `file_path`   (Read/Write/Edit)
 *   Pi `edits[].oldText`   ↔ UI `old_string`  (Edit, single entry)
 *   Pi `edits[].newText`   ↔ UI `new_string`  (Edit, single entry)
 *
 * Multi-entry `edits[]` arrays are left as-is; DiffPart.tsx handles them
 * natively via the array branch in parseDiffInput.
 */
const FIELD_RENAME: Record<string, Record<string, string>> = {
  read: { path: 'file_path' },
  write: { path: 'file_path' },
  edit: { path: 'file_path' },
};

export function normalizeArgs(toolName: string, args: unknown): unknown {
  if (!args || typeof args !== 'object') return args;
  const rename = FIELD_RENAME[toolName.toLowerCase()];
  // Apply top-level field renames (path → file_path).
  const out: Record<string, unknown> = rename
    ? (() => {
        const o = { ...(args as Record<string, unknown>) };
        for (const [from, to] of Object.entries(rename)) {
          if (from in o && !(to in o)) {
            o[to] = o[from];
            delete o[from];
          }
        }
        return o;
      })()
    : { ...(args as Record<string, unknown>) };

  // Pi edit: edits[] with a single entry → flatten to old_string / new_string
  // for renderer helpers that consume the flat format.
  // Multi-entry arrays are kept; DiffPart handles them with its own branch.
  if (toolName.toLowerCase() === 'edit' && Array.isArray(out.edits) && out.edits.length === 1) {
    const e = out.edits[0] as { oldText?: unknown; newText?: unknown };
    if (typeof e.oldText === 'string' && typeof e.newText === 'string') {
      out.old_string = e.oldText;
      out.new_string = e.newText;
      // Keep edits[] as well — DiffPart prefers the array branch, but
      // tool-summary fallbacks may inspect the flat fields.
    }
  }

  return out;
}
