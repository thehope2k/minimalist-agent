import { readFileSync, statSync } from 'node:fs';
import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import {
  type DraftAttachment,
  readPathAsDraft,
  readStoredAsBase64,
  storeDraft,
} from '../storage/attachments';
import type { StoredAttachment } from '../storage/sessions';
import { type FileSearchEntry, searchFiles } from '../files/search';
import { buildFileTree, listDirectory } from '../files/list-directory';
import { isWithinAllowedRoots, resolveWithinAllowedRoots, type FileStatResult } from '../files/path-guard';

/** Attachments, file search/tree (mention picker + file explorer), and native fs dialogs. */
export function registerFilesIpc(): void {
  // ---- Attachments -------------------------------------------------------

  ipcMain.handle('attachments:pickFiles', async (event): Promise<DraftAttachment[]> => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const opts = {
      properties: ['openFile', 'multiSelections'] as Array<
        'openFile' | 'multiSelections'
      >,
      filters: [
        { name: 'All Files', extensions: ['*'] },
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] },
        { name: 'Documents', extensions: ['pdf', 'txt', 'md'] },
        { name: 'Office', extensions: ['docx', 'xlsx', 'pptx', 'doc', 'xls', 'ppt'] },
        {
          name: 'Code',
          extensions: ['ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'json', 'yaml', 'yml'],
        },
      ],
    };
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    if (res.canceled) return [];
    const out: DraftAttachment[] = [];
    for (const p of res.filePaths) {
      try {
        const d = readPathAsDraft(p);
        if (d) out.push(d);
      } catch {
        // Skip unreadable / oversize files. Errors surfaced per-path on
        // explicit drag-and-drop / paste paths instead.
      }
    }
    return out;
  });

  ipcMain.handle(
    'attachments:readPath',
    (_e, p: string): DraftAttachment | null => {
      try {
        return readPathAsDraft(p);
      } catch (e) {
        throw e instanceof Error ? e : new Error(String(e));
      }
    },
  );

  ipcMain.handle(
    'attachments:store',
    async (_e, sessionId: string, draft: DraftAttachment): Promise<StoredAttachment> => {
      return storeDraft(sessionId, draft);
    },
  );

  ipcMain.handle(
    'attachments:readAsBase64',
    (_e, storedPath: string): string | null => readStoredAsBase64(storedPath),
  );

  ipcMain.handle('attachments:reveal', (_e, storedPath: string) => {
    shell.showItemInFolder(storedPath);
  });

  // ---- File search (mention picker) -------------------------------------

  ipcMain.handle(
    'files:search',
    (
      _e,
      args: { root: string; query: string; limit?: number },
    ): FileSearchEntry[] => {
      if (!isWithinAllowedRoots(args.root)) return [];
      return searchFiles({ root: args.root, query: args.query, limit: args.limit });
    },
  );

  ipcMain.handle(
    'files:grep',
    async (
      _e,
      args: { root: string; query: string; useRegex?: boolean; caseSensitive?: boolean; limit?: number },
    ) => {
      if (!isWithinAllowedRoots(args.root)) return [];
      const { grepFiles } = await import('../files/grep');
      return grepFiles(args);
    },
  );

  // ---- File tree (file explorer panel) ----------------------------------

  ipcMain.handle(
    'files:listDirectory',
    (
      _e,
      args: { path: string; root: string; includeHidden?: boolean },
    ) => {
      if (!isWithinAllowedRoots(args.path)) return [];
      return listDirectory(args);
    },
  );

  ipcMain.handle(
    'files:buildFileTree',
    (
      _e,
      args: { path: string; root: string; includeHidden?: boolean; maxDepth?: number },
    ) => {
      if (!isWithinAllowedRoots(args.path)) return [];
      return buildFileTree(args);
    },
  );

  // Existence/type probe for click-to-open references (chat links, tool-call
  // paths). Confined to allowed roots like every other files:*/fs:* handler.
  ipcMain.handle('files:stat', (_e, rawPath: string): FileStatResult => {
    const safePath = resolveWithinAllowedRoots(rawPath);
    if (!safePath) return { kind: 'unavailable' };
    try {
      const stat = statSync(safePath);
      if (stat.isDirectory()) return { kind: 'dir', absolutePath: safePath };
      return { kind: 'file', absolutePath: safePath, size: stat.size };
    } catch {
      return { kind: 'unavailable' };
    }
  });

  // ---- Filesystem dialogs ------------------------------------------------

  ipcMain.handle('fs:pickDirectory', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const opts = {
      properties: ['openDirectory', 'createDirectory'] as Array<
        'openDirectory' | 'createDirectory'
      >,
    };
    const result = win
      ? await dialog.showOpenDialog(win, opts)
      : await dialog.showOpenDialog(opts);
    return result.canceled ? null : result.filePaths[0] ?? null;
  });

  ipcMain.handle('fs:pickFile', async (event, opts?: { defaultPath?: string; title?: string }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const dialogOpts = {
      title: opts?.title ?? 'Select file',
      defaultPath: opts?.defaultPath ?? (process.platform === 'win32' ? 'C:\\Windows\\System32' : '/bin'),
      properties: ['openFile'] as Array<'openFile'>,
    };
    const result = win
      ? await dialog.showOpenDialog(win, dialogOpts)
      : await dialog.showOpenDialog(dialogOpts);
    return result.canceled ? null : result.filePaths[0] ?? null;
  });

  ipcMain.handle('fs:readFile', (_e, absolutePath: string): string | null => {
    // Guard: skip files larger than 2 MB to keep the renderer responsive.
    const MAX_BYTES = 2 * 1024 * 1024;
    // Confine to known roots + resolve symlinks before any read.
    const safePath = resolveWithinAllowedRoots(absolutePath);
    if (!safePath) return null;
    try {
      if (statSync(safePath).size > MAX_BYTES) return null;
      return readFileSync(safePath, 'utf-8');
    } catch {
      return null;
    }
  });

  ipcMain.handle('fs:readFileBase64', (_e, absolutePath: string): string | null => {
    // Used for binary files (images). 20 MB cap — larger assets are rarely
    // useful to preview and would bloat the IPC payload.
    const MAX_BYTES = 20 * 1024 * 1024;
    // Confine to known roots + resolve symlinks before any read.
    const safePath = resolveWithinAllowedRoots(absolutePath);
    if (!safePath) return null;
    try {
      if (statSync(safePath).size > MAX_BYTES) return null;
      return readFileSync(safePath).toString('base64');
    } catch {
      return null;
    }
  });
}
