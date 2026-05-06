import { promises as fsp } from 'node:fs';

/**
 * Read an artifact file at `absolutePath` and return its contents.
 * Throws if the file does not exist.
 */
export async function readArtifact(absolutePath: string): Promise<string> {
  try {
    return await fsp.readFile(absolutePath, 'utf-8');
  } catch (e) {
    throw new Error(`Artifact not found: ${absolutePath}`);
  }
}

/**
 * Count all GFM task-list checkboxes in `content`.
 * Matches `- [ ]` and `- [x]` / `- [X]`.
 */
export function countCheckboxes(content: string): {
  total: number;
  checked: number;
} {
  const total = (content.match(/- \[[ xX]\]/g) || []).length;
  const checked = (content.match(/- \[[xX]\]/g) || []).length;
  return { total, checked };
}

/**
 * Toggle the nth checkbox (0-indexed) in the file at `absolutePath`.
 * `[ ]` → `[x]` and `[x]` / `[X]` → `[ ]`.
 */
export async function toggleTaskCheckbox(
  absolutePath: string,
  checkboxIndex: number,
): Promise<void> {
  let content: string;
  try {
    content = await fsp.readFile(absolutePath, 'utf-8');
  } catch {
    throw new Error(`File not found: ${absolutePath}`);
  }

  let count = -1;
  const updated = content.replace(/- \[[ xX]\]/g, (match) => {
    count++;
    if (count === checkboxIndex) {
      return match === '- [ ]' ? '- [x]' : '- [ ]';
    }
    return match;
  });

  if (count < checkboxIndex) {
    throw new Error(
      `Checkbox index ${checkboxIndex} out of range (found ${count + 1} checkboxes)`,
    );
  }

  await fsp.writeFile(absolutePath, updated, 'utf-8');
}
