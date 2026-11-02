// Extension setup surface: secrets, plain inputs, consent, readiness status,
// and connection testing. File/validation IPC lives in assets-ipc.ts.

import { BrowserWindow, ipcMain } from 'electron';
import { loadExtensionAtPath } from '../extensions/storage';
import type { LoadedExtension } from '../extensions/types';
import {
  deleteSecret,
  isSecretsEncryptionAvailable,
  loadExtensionSecrets,
  setSecret,
} from '../extensions/secrets';
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

function requireExtension(extensionPath: string): LoadedExtension {
  const ext = loadExtensionAtPath(extensionPath);
  if (!ext) throw new Error(`Extension not found at ${extensionPath}`);
  return ext;
}

// Handlers take the extension's folder path (not just its slug) so project-tier
// extensions, which live outside the user extensions dir, resolve too.
export function registerExtensionSetupIpc(): void {
  ipcMain.handle(
    'extensions:setup.status',
    async (_e, extensionPath: string): Promise<ExtensionSetupSnapshot | null> => {
      const ext = loadExtensionAtPath(extensionPath);
      if (!ext) return null;
      await loadExtensionSecrets();
      return {
        ...getSetupStatus(ext),
        encryptionAvailable: await isSecretsEncryptionAvailable(),
        hasConsent: hasConsent(ext),
      };
    },
  );

  ipcMain.handle(
    'extensions:secrets.set',
    async (_e, extensionPath: string, keyName: string, value: string): Promise<void> => {
      const ext = requireExtension(extensionPath);
      await setSecret(ext.slug, keyName, value);
      // Saving a credential is itself the deliberate act of trust for a
      // credential-only extension; MCP servers keep the explicit Allow step
      // because running unreviewed code is a different decision.
      if (!ext.config.mcp) grantConsent(ext);
      broadcastMcpStatusChanged();
    },
  );

  ipcMain.handle(
    'extensions:secrets.delete',
    async (_e, extensionPath: string, keyName: string): Promise<void> => {
      await deleteSecret(requireExtension(extensionPath).slug, keyName);
      broadcastMcpStatusChanged();
    },
  );

  ipcMain.handle(
    'extensions:inputs.set',
    (_e, extensionPath: string, key: string, value: string): void => {
      setInput(requireExtension(extensionPath).slug, key, value);
      broadcastMcpStatusChanged();
    },
  );

  ipcMain.handle('extensions:inputs.delete', (_e, extensionPath: string, key: string): void => {
    deleteInput(requireExtension(extensionPath).slug, key);
    broadcastMcpStatusChanged();
  });

  ipcMain.handle('extensions:consent.grant', (_e, extensionPath: string): void => {
    grantConsent(requireExtension(extensionPath));
    broadcastMcpStatusChanged();
  });

  ipcMain.handle('extensions:consent.revoke', (_e, extensionPath: string): void => {
    revokeConsent(requireExtension(extensionPath));
    broadcastMcpStatusChanged();
  });

  ipcMain.handle('extensions:mcp.status', async (): Promise<McpExtensionStatus[]> => {
    await loadExtensionSecrets();
    return listMcpExtensionsStatus();
  });

  ipcMain.handle(
    'extensions:mcp.test',
    async (_e, extensionPath: string): Promise<McpTestResult> => {
      const ext = loadExtensionAtPath(extensionPath);
      if (!ext) return { ok: false, error: 'Extension not found.' };
      const result = await testMcpConnection(ext);
      broadcastMcpStatusChanged();
      return result;
    },
  );
}
