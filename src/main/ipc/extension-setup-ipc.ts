// Extension setup surface: secrets, plain inputs, consent, readiness status,
// and connection testing. File/validation IPC lives in assets-ipc.ts.

import { BrowserWindow, ipcMain } from 'electron';
import { loadExtensionBySlug } from '../extensions/storage';
import { deleteSecret, isSecretsEncryptionAvailable, setSecret } from '../extensions/secrets';
import { deleteInput, setInput } from '../extensions/inputs';
import { getSetupStatus } from '../extensions/setup';
import {
  grantConsent,
  hasConsent,
  listMcpExtensionsStatus,
  revokeConsent,
} from '../extensions/mcp-config';
import { testMcpConnection } from '../extensions/mcp-test';
import type {
  ExtensionSetupSnapshot,
  McpExtensionStatus,
  McpTestResult,
} from '../../shared/electron-api';

// Setup/consent changes alter which mcp-backed extensions are eligible;
// broadcasting lets open panels re-read `mcp.status` and refresh badges.
function broadcastMcpStatusChanged(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('mcp-status');
  }
}

export function registerExtensionSetupIpc(): void {
  ipcMain.handle('extensions:setup.status', (_e, slug: string): ExtensionSetupSnapshot | null => {
    const ext = loadExtensionBySlug(slug);
    if (!ext) return null;
    return {
      ...getSetupStatus(ext),
      encryptionAvailable: isSecretsEncryptionAvailable(),
      hasConsent: hasConsent(ext),
    };
  });

  ipcMain.handle(
    'extensions:secrets.set',
    (_e, slug: string, keyName: string, value: string): void => {
      setSecret(slug, keyName, value);
      // Saving a credential is itself the deliberate act of trust for a
      // credential-only extension; MCP servers keep the explicit Allow step
      // because running unreviewed code is a different decision.
      const ext = loadExtensionBySlug(slug);
      if (ext && !ext.config.mcp) grantConsent(ext);
      broadcastMcpStatusChanged();
    },
  );

  ipcMain.handle('extensions:secrets.delete', (_e, slug: string, keyName: string): void => {
    deleteSecret(slug, keyName);
    broadcastMcpStatusChanged();
  });

  ipcMain.handle('extensions:inputs.set', (_e, slug: string, key: string, value: string): void => {
    setInput(slug, key, value);
    broadcastMcpStatusChanged();
  });

  ipcMain.handle('extensions:inputs.delete', (_e, slug: string, key: string): void => {
    deleteInput(slug, key);
    broadcastMcpStatusChanged();
  });

  ipcMain.handle('extensions:consent.grant', (_e, slug: string): boolean => {
    const ext = loadExtensionBySlug(slug);
    if (!ext) return false;
    grantConsent(ext);
    broadcastMcpStatusChanged();
    return true;
  });

  ipcMain.handle('extensions:consent.revoke', (_e, slug: string): boolean => {
    const ext = loadExtensionBySlug(slug);
    if (!ext) return false;
    revokeConsent(ext);
    broadcastMcpStatusChanged();
    return true;
  });

  ipcMain.handle('extensions:mcp.status', (): McpExtensionStatus[] => listMcpExtensionsStatus());

  ipcMain.handle('extensions:mcp.test', async (_e, slug: string): Promise<McpTestResult> => {
    const ext = loadExtensionBySlug(slug);
    if (!ext) return { ok: false, error: 'Extension not found.' };
    const result = await testMcpConnection(ext);
    broadcastMcpStatusChanged();
    return result;
  });
}
