// Recently opened files — persisted in localStorage.
//
// Each entry records the absolute path, the line number that was jumped to,
// and the timestamp so the list stays ordered by recency.
//
// Rules:
//   - Max MAX_ENTRIES entries; oldest are dropped when the list fills.
//   - Opening the same path again moves it to the front (dedup by path).
//   - lineNumber is updated to the latest jump target on revisit.

const STORAGE_KEY  = 'recent-files-v1';
const MAX_ENTRIES  = 30;

export interface RecentFile {
  absolutePath: string;
  lineNumber:   number;
  openedAt:     number;
}

function read(): RecentFile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RecentFile[];
  } catch {
    return [];
  }
}

function write(entries: RecentFile[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    /* quota / private mode — ignore */
  }
}

/** Return the current recent-files list, most recent first. */
export function list(): RecentFile[] {
  return read();
}

/** Push a file to the front of the list. Deduplicates by absolutePath. */
export function push(absolutePath: string, lineNumber: number): void {
  const prev    = read();
  const without = prev.filter((e) => e.absolutePath !== absolutePath);
  const next    = [{ absolutePath, lineNumber, openedAt: Date.now() }, ...without].slice(
    0,
    MAX_ENTRIES,
  );
  write(next);
}

/** Remove a single entry (e.g. if the file no longer exists). */
export function remove(absolutePath: string): void {
  write(read().filter((e) => e.absolutePath !== absolutePath));
}

/** Wipe the entire list. */
export function clear(): void {
  localStorage.removeItem(STORAGE_KEY);
}
