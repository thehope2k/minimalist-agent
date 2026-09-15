import { ipcRenderer } from 'electron';
import type {
  AppApi,
  ContentMatchEntry,
  FileSearchEntry,
  FileStatResult,
  FileTreeNode,
  Project,
  ProjectInput,
  SessionFileNode,
  SessionMeta,
  SharedExportResult,
  StoredMessage,
} from '../../shared/electron-api';

export function createStorageApi(): Pick<AppApi, 'sessions' | 'projects' | 'fs' | 'files'> {
  return {
    sessions: {
      list: (): Promise<SessionMeta[]> => ipcRenderer.invoke('sessions:list'),
      load: (id: string): Promise<{ meta: SessionMeta; messages: StoredMessage[] } | null> =>
        ipcRenderer.invoke('sessions:load', id),
      create: (opts?: {
        workingDirectory?: string;
        projectId?: string | null;
      }): Promise<SessionMeta> => ipcRenderer.invoke('sessions:create', opts),
      setProject: (id: string, projectId: string | null): Promise<SessionMeta> =>
        ipcRenderer.invoke('sessions:setProject', id, projectId),
      appendMessage: (id: string, msg: StoredMessage): Promise<void> =>
        ipcRenderer.invoke('sessions:appendMessage', id, msg),
      replaceLastMessage: (id: string, msg: StoredMessage): Promise<void> =>
        ipcRenderer.invoke('sessions:replaceLastMessage', id, msg),
      rewriteMessages: (id: string, messages: StoredMessage[]): Promise<void> =>
        ipcRenderer.invoke('sessions:rewriteMessages', id, messages),
      updateMeta: (
        id: string,
        patch: Partial<Omit<SessionMeta, 'id' | 'createdAt'>>,
      ): Promise<SessionMeta> => ipcRenderer.invoke('sessions:updateMeta', id, patch),
      truncateFrom: (id: string, firstDroppedId: string): Promise<number> =>
        ipcRenderer.invoke('sessions:truncateFrom', id, firstDroppedId),
      delete: (id: string): Promise<void> => ipcRenderer.invoke('sessions:delete', id),
      branch: (
        parentId: string,
        upToMessageId: string,
        options?: { withContext?: boolean },
      ): Promise<SessionMeta | null> =>
        ipcRenderer.invoke('sessions:branch', parentId, upToMessageId, options),
      revealInFolder: (id: string): Promise<void> =>
        ipcRenderer.invoke('sessions:revealInFolder', id),
      listFiles: (id: string): Promise<SessionFileNode[]> =>
        ipcRenderer.invoke('sessions:listFiles', id),
      revealFile: (absPath: string): Promise<void> =>
        ipcRenderer.invoke('sessions:revealFile', absPath),
      saveExport: (html: string, suggestedName: string): Promise<string | null> =>
        ipcRenderer.invoke('sessions:saveExport', { html, suggestedName }),
      shareExport: (
        html: string,
        filename: string,
        ttlDays?: number,
        backend?: 'brewpage' | 'meethtml',
      ): Promise<SharedExportResult> =>
        ipcRenderer.invoke('sessions:shareExport', { html, filename, ttlDays, backend }),
      revokeExport: (namespace: string, id: string, ownerToken: string): Promise<void> =>
        ipcRenderer.invoke('sessions:revokeExport', { namespace, id, ownerToken }),
    },
    projects: {
      list: (): Promise<Project[]> => ipcRenderer.invoke('projects:list'),
      create: (input: ProjectInput): Promise<Project> =>
        ipcRenderer.invoke('projects:create', input),
      reorder: (ids: string[]): Promise<void> => ipcRenderer.invoke('projects:reorder', ids),
      update: (
        id: string,
        patch: Partial<Omit<Project, 'id' | 'createdAt'>>,
      ): Promise<Project | null> => ipcRenderer.invoke('projects:update', id, patch),
      delete: (id: string): Promise<{ ok: boolean; sessionsCleared: number }> =>
        ipcRenderer.invoke('projects:delete', id),
    },
    fs: {
      pickDirectory: (): Promise<string | null> => ipcRenderer.invoke('fs:pickDirectory'),
      pickFile: (opts?: { defaultPath?: string; title?: string }): Promise<string | null> =>
        ipcRenderer.invoke('fs:pickFile', opts),
      readFile: (absolutePath: string): Promise<string | null> =>
        ipcRenderer.invoke('fs:readFile', absolutePath),
      readFileBase64: (absolutePath: string): Promise<string | null> =>
        ipcRenderer.invoke('fs:readFileBase64', absolutePath),
    },
    files: {
      search: (args: { root: string; query: string; limit?: number }): Promise<FileSearchEntry[]> =>
        ipcRenderer.invoke('files:search', args),
      grep: (args: {
        root: string;
        query: string;
        useRegex?: boolean;
        caseSensitive?: boolean;
        limit?: number;
      }): Promise<ContentMatchEntry[]> => ipcRenderer.invoke('files:grep', args),
      listDirectory: (args: {
        path: string;
        root: string;
        includeHidden?: boolean;
      }): Promise<FileTreeNode[]> => ipcRenderer.invoke('files:listDirectory', args),
      buildFileTree: (args: {
        path: string;
        root: string;
        includeHidden?: boolean;
        maxDepth?: number;
      }): Promise<FileTreeNode[]> => ipcRenderer.invoke('files:buildFileTree', args),
      stat: (absolutePath: string): Promise<FileStatResult> =>
        ipcRenderer.invoke('files:stat', absolutePath),
    },
  };
}
