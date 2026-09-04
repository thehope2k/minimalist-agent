import { writeFile } from 'node:fs/promises';
import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { browserPaneManager } from '../browser/browser-pane-manager';
import {
  appendMessage,
  branchSession,
  createSession,
  deleteSession,
  listSessionFiles,
  listSessions,
  loadSession,
  replaceLastMessage,
  rewriteMessages,
  type SessionMeta,
  sessionPath,
  setSessionProject,
  type StoredMessage,
  truncateMessagesFrom,
  updateSessionMeta,
} from '../storage/sessions';
import { resolveWithinAllowedRoots } from '../files/path-guard';
import { publishExport, revokeExport, type PublishResult } from '../export-transport/brewpage';
import { publishExportFallback, revokeExportFallback } from '../export-transport/meethtml';

/** Session persistence: create/load/list/mutate messages, export/share, revealInFolder. */
export function registerSessionsIpc(): void {
  ipcMain.handle('sessions:list', () => listSessions());
  ipcMain.handle('sessions:load', (_e, id: string) => loadSession(id));
  ipcMain.handle(
    'sessions:create',
    (_e, opts?: { workingDirectory?: string; projectId?: string | null }) =>
      createSession(opts),
  );
  ipcMain.handle(
    'sessions:setProject',
    (_e, id: string, projectId: string | null) =>
      setSessionProject(id, projectId),
  );
  ipcMain.handle(
    'sessions:appendMessage',
    (_e, id: string, msg: StoredMessage) => appendMessage(id, msg),
  );
  ipcMain.handle(
    'sessions:replaceLastMessage',
    (_e, id: string, msg: StoredMessage) => replaceLastMessage(id, msg),
  );
  ipcMain.handle(
    'sessions:rewriteMessages',
    (_e, id: string, messages: StoredMessage[]) => rewriteMessages(id, messages),
  );
  ipcMain.handle(
    'sessions:updateMeta',
    (
      _event,
      id: string,
      patch: Partial<Omit<SessionMeta, 'id' | 'createdAt'>>,
    ) => {
      return updateSessionMeta(id, patch);
    },
  );
  ipcMain.handle(
    'sessions:truncateFrom',
    (_e, id: string, firstDroppedId: string) =>
      truncateMessagesFrom(id, firstDroppedId),
  );
  ipcMain.handle('sessions:delete', (_e, id: string) => {
    browserPaneManager.destroyForSession(id);
    deleteSession(id);
  });
  ipcMain.handle('sessions:revealInFolder', (_e, id: string) => {
    shell.showItemInFolder(sessionPath(id));
  });
  ipcMain.handle('sessions:branch', (_e, parentId: string, upToMessageId: string, options?: { withContext?: boolean }) =>
    branchSession(parentId, upToMessageId, options),
  );
  ipcMain.handle('sessions:listFiles', (_e, id: string) => listSessionFiles(id));
  ipcMain.handle('sessions:revealFile', (_e, absPath: string) => {
    // Guard lives here, not just at renderer call sites — every caller
    // (FileRefMenu, TreeNode, any future one) gets it for free, and none can
    // bypass it by calling window.api.sessions.revealFile directly.
    const safePath = resolveWithinAllowedRoots(absPath);
    if (!safePath) return;
    shell.showItemInFolder(safePath);
  });

  ipcMain.handle(
    'sessions:saveExport',
    async (
      event,
      args: { html: string; suggestedName: string },
    ): Promise<string | null> => {
      const win = BrowserWindow.fromWebContents(event.sender);
      const safe = (args.suggestedName || 'session').replace(/[^a-z0-9._-]+/gi, '-');
      const opts = {
        defaultPath: `${safe}.html`,
        filters: [{ name: 'HTML', extensions: ['html'] }],
      };
      const res = win
        ? await dialog.showSaveDialog(win, opts)
        : await dialog.showSaveDialog(opts);
      if (res.canceled || !res.filePath) return null;
      await writeFile(res.filePath, args.html, 'utf-8');
      return res.filePath;
    },
  );

  // Publish an HTML export — BrewPage or meethtml.com depending on `backend`.
  // Privacy posture is the same on both: unlisted/anonymous URL, auto-expires,
  // redaction already happened in the renderer.
  ipcMain.handle(
    'sessions:shareExport',
    async (
      _e,
      args: { html: string; filename: string; ttlDays?: number; backend?: 'brewpage' | 'meethtml' },
    ): Promise<PublishResult> => {
      if (args.backend === 'meethtml') {
        return publishExportFallback({ html: args.html, filename: args.filename, ttlDays: args.ttlDays });
      }
      return publishExport({ html: args.html, filename: args.filename, ttlDays: args.ttlDays });
    },
  );

  ipcMain.handle(
    'sessions:revokeExport',
    async (
      _e,
      args: { namespace: string; id: string; ownerToken: string },
    ): Promise<void> =>
      args.namespace === 'meethtml'
        ? revokeExportFallback(args)
        : revokeExport(args),
  );
}
