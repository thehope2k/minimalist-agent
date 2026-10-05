import { ipcRenderer } from 'electron';
import type {
  AgentFileNode,
  AppApi,
  DraftAttachment,
  ExtensionFileNode,
  ExtensionSetupSnapshot,
  LoadedAgent,
  LoadedExtension,
  LoadedSkill,
  McpExtensionStatus,
  McpTestResult,
  SkillFileNode,
  StoredAttachment,
} from '../../shared/electron-api';

export function createAssetsApi(): Pick<
  AppApi,
  'skills' | 'agents' | 'context' | 'extensions' | 'attachments'
> {
  return {
    skills: {
      getDir: (): Promise<string> => ipcRenderer.invoke('skills:getDir'),
      getProjectDir: (cwd: string): Promise<string> =>
        ipcRenderer.invoke('skills:getProjectDir', cwd),
      getReferenceDocPath: (): Promise<string> => ipcRenderer.invoke('skills:getReferenceDocPath'),
      list: (): Promise<LoadedSkill[]> => ipcRenderer.invoke('skills:list'),
      get: (slug: string): Promise<LoadedSkill | null> => ipcRenderer.invoke('skills:get', slug),
      listFiles: (dirPath: string): Promise<SkillFileNode[]> =>
        ipcRenderer.invoke('skills:listFiles', dirPath),
      delete: (dirPath: string): Promise<boolean> => ipcRenderer.invoke('skills:delete', dirPath),
      invalidateCache: (): Promise<void> => ipcRenderer.invoke('skills:invalidateCache'),
      openInEditor: (dirPath: string): Promise<string> =>
        ipcRenderer.invoke('skills:openInEditor', dirPath),
      revealInFinder: (dirPath: string): Promise<void> =>
        ipcRenderer.invoke('skills:revealInFinder', dirPath),
      validate: (dirPath: string, slug: string): Promise<{ ok: boolean; report: string }> =>
        ipcRenderer.invoke('skills:validate', dirPath, slug),
    },
    agents: {
      getDir: (): Promise<string> => ipcRenderer.invoke('agents:getDir'),
      getProjectDir: (cwd: string): Promise<string> =>
        ipcRenderer.invoke('agents:getProjectDir', cwd),
      list: (): Promise<LoadedAgent[]> => ipcRenderer.invoke('agents:list'),
      get: (slug: string): Promise<LoadedAgent | null> => ipcRenderer.invoke('agents:get', slug),
      listFiles: (dirPath: string): Promise<AgentFileNode[]> =>
        ipcRenderer.invoke('agents:listFiles', dirPath),
      delete: (slug: string): Promise<boolean> => ipcRenderer.invoke('agents:delete', slug),
      invalidateCache: (): Promise<void> => ipcRenderer.invoke('agents:invalidateCache'),
      openInEditor: (dirPath: string): Promise<string> =>
        ipcRenderer.invoke('agents:openInEditor', dirPath),
      revealInFinder: (dirPath: string): Promise<void> =>
        ipcRenderer.invoke('agents:revealInFinder', dirPath),
      validate: (dirPath: string, slug: string): Promise<{ ok: boolean; report: string }> =>
        ipcRenderer.invoke('agents:validate', dirPath, slug),
    },
    context: {
      listAvailable: (
        cwd?: string,
        invalidate?: boolean,
      ): Promise<{
        skills: LoadedSkill[];
        agents: LoadedAgent[];
        extensions: LoadedExtension[];
      }> => ipcRenderer.invoke('context:listAvailable', cwd, invalidate),
      pin: (sessionId: string, scopedSlug: string): Promise<unknown> =>
        ipcRenderer.invoke('context:pin', sessionId, scopedSlug),
      unpin: (sessionId: string, scopedSlug: string): Promise<unknown> =>
        ipcRenderer.invoke('context:unpin', sessionId, scopedSlug),
      estimateTokens: (pinnedAssets: string[], cwd?: string): Promise<number> =>
        ipcRenderer.invoke('context:estimateTokens', pinnedAssets, cwd),
      hasProjectAssets: (cwd: string): Promise<boolean> =>
        ipcRenderer.invoke('context:hasProjectAssets', cwd),
    },
    extensions: {
      getDir: (): Promise<string> => ipcRenderer.invoke('extensions:getDir'),
      getProjectDir: (cwd: string): Promise<string> =>
        ipcRenderer.invoke('extensions:getProjectDir', cwd),
      getReferenceDocPath: (): Promise<string> =>
        ipcRenderer.invoke('extensions:getReferenceDocPath'),
      list: (cwd?: string): Promise<LoadedExtension[]> =>
        ipcRenderer.invoke('extensions:list', cwd),
      get: (slug: string): Promise<LoadedExtension | null> =>
        ipcRenderer.invoke('extensions:get', slug),
      listFiles: (dirPath: string): Promise<ExtensionFileNode[]> =>
        ipcRenderer.invoke('extensions:listFiles', dirPath),
      delete: (dirPath: string): Promise<boolean> =>
        ipcRenderer.invoke('extensions:delete', dirPath),
      invalidateCache: (): Promise<void> => ipcRenderer.invoke('extensions:invalidateCache'),
      openInEditor: (dirPath: string): Promise<string> =>
        ipcRenderer.invoke('extensions:openInEditor', dirPath),
      revealInFinder: (dirPath: string): Promise<void> =>
        ipcRenderer.invoke('extensions:revealInFinder', dirPath),
      validate: (dirPath: string, slug: string): Promise<{ ok: boolean; report: string }> =>
        ipcRenderer.invoke('extensions:validate', dirPath, slug),

      /* setup */
      setupStatus: (slug: string): Promise<ExtensionSetupSnapshot | null> =>
        ipcRenderer.invoke('extensions:setup.status', slug),
      setSecret: (slug: string, keyName: string, value: string): Promise<void> =>
        ipcRenderer.invoke('extensions:secrets.set', slug, keyName, value),
      deleteSecret: (slug: string, keyName: string): Promise<void> =>
        ipcRenderer.invoke('extensions:secrets.delete', slug, keyName),
      setInput: (slug: string, key: string, value: string): Promise<void> =>
        ipcRenderer.invoke('extensions:inputs.set', slug, key, value),
      deleteInput: (slug: string, key: string): Promise<void> =>
        ipcRenderer.invoke('extensions:inputs.delete', slug, key),

      /* consent */
      grantConsent: (slug: string): Promise<boolean> =>
        ipcRenderer.invoke('extensions:consent.grant', slug),
      revokeConsent: (slug: string): Promise<boolean> =>
        ipcRenderer.invoke('extensions:consent.revoke', slug),

      /* mcp diagnostics */
      mcpStatus: (): Promise<McpExtensionStatus[]> => ipcRenderer.invoke('extensions:mcp.status'),
      testMcp: (slug: string): Promise<McpTestResult> =>
        ipcRenderer.invoke('extensions:mcp.test', slug),
      /** Runtime MCP connection outcomes, pushed when a session connects its
       *  servers. Fires a refresh hint; callers re-read `mcpStatus()`. */
      onMcpStatus: (cb: () => void): (() => void) => {
        const handler = () => cb();
        ipcRenderer.on('mcp-status', handler);
        return () => ipcRenderer.removeListener('mcp-status', handler);
      },
    },
    attachments: {
      pickFiles: (): Promise<DraftAttachment[]> => ipcRenderer.invoke('attachments:pickFiles'),
      readPath: (path: string): Promise<DraftAttachment | null> =>
        ipcRenderer.invoke('attachments:readPath', path),
      store: (sessionId: string, draft: DraftAttachment): Promise<StoredAttachment> =>
        ipcRenderer.invoke('attachments:store', sessionId, draft),
      readAsBase64: (storedPath: string): Promise<string | null> =>
        ipcRenderer.invoke('attachments:readAsBase64', storedPath),
      reveal: (storedPath: string): Promise<void> =>
        ipcRenderer.invoke('attachments:reveal', storedPath),
    },
  };
}
