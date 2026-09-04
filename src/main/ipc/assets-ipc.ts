import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { BrowserWindow, ipcMain, shell } from 'electron';
import {
  deleteSkill,
  getSkillsDir,
  getProjectSkillsDir,
  invalidateSkillsCache,
  loadAllSkills,
  type LoadedSkill,
  loadSkillBySlug,
  scanSkillDirectory,
  type SkillFileNode,
} from '../skills/storage';
import { formatValidationResult, validateSkillContent } from '../skills/parse';
import {
  type AgentFileNode,
  deleteAgent,
  getAgentsDir,
  getProjectAgentsDir,
  invalidateAgentsCache,
  loadAgentBySlug,
  loadAllAgents,
  type LoadedAgent,
  scanAgentDirectory,
} from '../agents/storage';
import { formatValidationResult as formatAgentValidationResult, validateAgentContent } from '../agents/parse';
import {
  deleteExtension,
  type ExtensionFileNode,
  getExtensionsDir,
  getProjectExtensionsDir,
  invalidateExtensionsCache,
  loadAllExtensions,
  loadExtensionBySlug,
  scanExtensionDirectory,
} from '../extensions/storage';
import type { LoadedExtension } from '../extensions/types';
import {
  formatValidationResult as formatExtensionValidationResult,
  validateExtensionConfigContent,
  validateExtensionGuideContent,
} from '../extensions/parse';
import { getExtensionRegistry } from '../extensions/registry';
import {
  deleteSecret as deleteExtensionSecret,
  isSecretsEncryptionAvailable,
  listSecretKeys as listExtensionSecretKeys,
  setSecret as setExtensionSecret,
} from '../extensions/secrets';
import {
  grantConsent,
  hasConsent,
  listDeclaredSecrets,
  listMcpExtensionsStatus,
  listMissingSecrets,
  revokeConsent,
} from '../extensions/mcp-config';
import { pinAsset, unpinAsset } from '../storage/sessions';
import { estimatePinnedTokens } from '../agent/system-prompt';
import { Paths } from '../storage/paths';

/** Skills, agents, extensions (incl. secrets/consent), and the context-panel
 *  asset listing/pinning surface. */
export function registerAssetsIpc(): void {
  // ---- Skills -----------------------------------------------------------

  ipcMain.handle('skills:getDir', (): string => getSkillsDir());
  ipcMain.handle('skills:getProjectDir', (_e, cwd: string): string => getProjectSkillsDir(cwd));
  ipcMain.handle(
    'skills:getReferenceDocPath',
    (): string => Paths.skillsReferenceDoc(),
  );
  ipcMain.handle('skills:list', (): LoadedSkill[] => loadAllSkills());
  ipcMain.handle(
    'skills:get',
    (_e, slug: string): LoadedSkill | null => loadSkillBySlug(slug),
  );
  ipcMain.handle(
    'skills:listFiles',
    (_e, dirPath: string): SkillFileNode[] => scanSkillDirectory(dirPath),
  );
  ipcMain.handle(
    'skills:delete',
    (_e, dirPath: string): boolean => deleteSkill(dirPath),
  );
  ipcMain.handle('skills:invalidateCache', () => invalidateSkillsCache());
  ipcMain.handle('skills:openInEditor', async (_e, dirPath: string) => {
    // `openPath` will use the OS's default handler (e.g. "Open With" pref).
    return shell.openPath(dirPath);
  });
  ipcMain.handle('skills:revealInFinder', (_e, dirPath: string) => {
    shell.showItemInFolder(dirPath);
  });
  ipcMain.handle(
    'skills:validate',
    (_e, dirPath: string, slug: string): { ok: boolean; report: string } => {
      try {
        const content = readFileSync(`${dirPath}/SKILL.md`, 'utf-8');
        const result = validateSkillContent(content, slug);
        return { ok: result.valid, report: formatValidationResult(result) };
      } catch (e) {
        return {
          ok: false,
          report: `✗ Could not read SKILL.md: ${e instanceof Error ? e.message : String(e)}`,
        };
      }
    },
  );

  // ---- Agents ---------------------------------------------------------

  ipcMain.handle('agents:getDir', (): string => getAgentsDir());
  ipcMain.handle('agents:getProjectDir', (_e, cwd: string): string => getProjectAgentsDir(cwd));
  ipcMain.handle(
    'agents:list',
    (): LoadedAgent[] => loadAllAgents(),
  );
  ipcMain.handle(
    'agents:get',
    (_e, slug: string): LoadedAgent | null => loadAgentBySlug(slug),
  );
  ipcMain.handle(
    'agents:listFiles',
    (_e, dirPath: string): AgentFileNode[] => scanAgentDirectory(dirPath),
  );
  ipcMain.handle(
    'agents:delete',
    (_e, slug: string): boolean => deleteAgent(slug),
  );
  ipcMain.handle('agents:invalidateCache', () => {
    invalidateAgentsCache();
  });
  ipcMain.handle('agents:openInEditor', async (_e, dirPath: string) => {
    return shell.openPath(dirPath);
  });
  ipcMain.handle('agents:revealInFinder', (_e, dirPath: string) => {
    shell.showItemInFolder(dirPath);
  });
  ipcMain.handle(
    'agents:validate',
    (_e, dirPath: string, slug: string): { ok: boolean; report: string } => {
      try {
        const content = readFileSync(`${dirPath}/AGENT.md`, 'utf-8');
        const result = validateAgentContent(content, slug);
        return { ok: result.valid, report: formatAgentValidationResult(result) };
      } catch (e) {
        return {
          ok: false,
          report: `✗ Could not read AGENT.md: ${e instanceof Error ? e.message : String(e)}`,
        };
      }
    },
  );

  // ---- Extensions -------------------------------------------------------

  ipcMain.handle('extensions:getDir', (): string => getExtensionsDir());
  ipcMain.handle('extensions:getProjectDir', (_e, cwd: string): string => getProjectExtensionsDir(cwd));
  ipcMain.handle(
    'extensions:getReferenceDocPath',
    (): string => Paths.extensionsReferenceDoc(),
  );
  ipcMain.handle(
    'extensions:list',
    (_e, cwd?: string): LoadedExtension[] => loadAllExtensions(cwd),
  );
  ipcMain.handle(
    'extensions:get',
    (_e, slug: string): LoadedExtension | null => loadExtensionBySlug(slug),
  );
  ipcMain.handle(
    'extensions:listFiles',
    (_e, dirPath: string): ExtensionFileNode[] =>
      scanExtensionDirectory(dirPath),
  );
  ipcMain.handle(
    'extensions:delete',
    (_e, dirPath: string): boolean => {
      const ok = deleteExtension(dirPath);
      if (ok) getExtensionRegistry().load();
      return ok;
    },
  );
  ipcMain.handle('extensions:invalidateCache', () => {
    invalidateExtensionsCache();
    getExtensionRegistry().load();
  });
  ipcMain.handle(
    'extensions:openInEditor',
    async (_e, dirPath: string) => shell.openPath(dirPath),
  );
  ipcMain.handle(
    'extensions:revealInFinder',
    (_e, dirPath: string) => shell.showItemInFolder(dirPath),
  );
  ipcMain.handle(
    'extensions:validate',
    (_e, dirPath: string, slug: string): { ok: boolean; report: string } => {
      const lines: string[] = [];
      let allValid = true;

      try {
        const raw = readFileSync(`${dirPath}/extension.json`, 'utf-8');
        const r = validateExtensionConfigContent(raw, slug);
        if (!r.valid) allValid = false;
        lines.push(formatExtensionValidationResult(r));
      } catch (e) {
        allValid = false;
        lines.push(
          `✗ Could not read extension.json: ${e instanceof Error ? e.message : String(e)}`,
        );
      }

      try {
        const raw = readFileSync(`${dirPath}/guide.md`, 'utf-8');
        const r = validateExtensionGuideContent(raw);
        if (!r.valid) allValid = false;
        lines.push('---');
        lines.push(formatExtensionValidationResult(r));
      } catch (e) {
        allValid = false;
        lines.push(
          `✗ Could not read guide.md: ${e instanceof Error ? e.message : String(e)}`,
        );
      }

      return { ok: allValid, report: lines.join('\n') };
    },
  );

  // ---- Extension secrets + consent --------------------------------------

  // Consent/secret changes alter which mcp-backed extensions are eligible.
  // Broadcasting lets open panels re-read `mcp.status` and refresh their
  // badges immediately, rather than waiting for a manual refresh.
  const broadcastMcpStatusChanged = () => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('mcp-status');
    }
  };

  ipcMain.handle('extensions:secrets.encryptionAvailable', (): boolean =>
    isSecretsEncryptionAvailable(),
  );
  ipcMain.handle(
    'extensions:secrets.listKeys',
    (_e, slug: string): string[] => listExtensionSecretKeys(slug),
  );
  ipcMain.handle(
    'extensions:secrets.set',
    (_e, slug: string, keyName: string, value: string): void => {
      setExtensionSecret(slug, keyName, value);
      // Saving a secret is itself the deliberate, explicit act of trust for
      // a credential-only extension (no `mcp`) — a separate "Allow" click
      // would just ask the user to confirm the same decision twice. MCP
      // servers keep the explicit step: running code the user hasn't
      // reviewed is a different kind of decision than handing over a token.
      const ext = loadExtensionBySlug(slug);
      if (ext && !ext.config.mcp) grantConsent(ext);
      broadcastMcpStatusChanged();
    },
  );
  ipcMain.handle(
    'extensions:secrets.delete',
    (_e, slug: string, keyName: string): void => {
      deleteExtensionSecret(slug, keyName);
      broadcastMcpStatusChanged();
    },
  );
  ipcMain.handle(
    'extensions:secrets.declared',
    (_e, slug: string): string[] => {
      const ext = loadExtensionBySlug(slug);
      return ext ? listDeclaredSecrets(ext) : [];
    },
  );
  ipcMain.handle(
    'extensions:secrets.missing',
    (_e, slug: string): string[] => {
      const ext = loadExtensionBySlug(slug);
      return ext ? listMissingSecrets(ext) : [];
    },
  );
  ipcMain.handle(
    'extensions:consent.has',
    (_e, slug: string): boolean => {
      const ext = loadExtensionBySlug(slug);
      return ext ? hasConsent(ext) : false;
    },
  );
  ipcMain.handle(
    'extensions:consent.grant',
    (_e, slug: string): boolean => {
      const ext = loadExtensionBySlug(slug);
      if (!ext) return false;
      grantConsent(ext);
      broadcastMcpStatusChanged();
      return true;
    },
  );
  ipcMain.handle(
    'extensions:consent.revoke',
    (_e, slug: string): boolean => {
      const ext = loadExtensionBySlug(slug);
      if (!ext) return false;
      revokeConsent(ext);
      broadcastMcpStatusChanged();
      return true;
    },
  );
  ipcMain.handle(
    'extensions:mcp.status',
    (): Array<{ slug: string; ok: boolean; reason?: string }> =>
      listMcpExtensionsStatus(),
  );

  // ── Context Panel: project-local config + session pinned assets ──────────

  /**
   * List all available assets (skills + agents) for a session, merged from
   * all tiers (project + user). Returns items tagged with their source tier.
   */
  ipcMain.handle(
    'context:listAvailable',
    (_e, cwd?: string, invalidate?: boolean): { skills: LoadedSkill[]; agents: LoadedAgent[]; extensions: LoadedExtension[] } => {
      if (invalidate) {
        invalidateSkillsCache(cwd);
        invalidateAgentsCache(cwd);
        invalidateExtensionsCache(cwd);
      }
      return {
        skills: loadAllSkills(cwd),
        agents: loadAllAgents(cwd),
        extensions: loadAllExtensions(cwd),
      };
    },
  );

  /** Pin a scoped asset to a session. scopedSlug: 'user:<slug>' | 'project:<slug>' */
  ipcMain.handle(
    'context:pin',
    (_e, sessionId: string, scopedSlug: string) => pinAsset(sessionId, scopedSlug),
  );

  /** Unpin a scoped asset from a session. */
  ipcMain.handle(
    'context:unpin',
    (_e, sessionId: string, scopedSlug: string) => unpinAsset(sessionId, scopedSlug),
  );

  /**
   * Estimate token cost of all pinned assets for a session.
   * Returns total estimated tokens.
   */
  ipcMain.handle(
    'context:estimateTokens',
    (_e, pinnedAssets: string[], cwd?: string): number =>
      estimatePinnedTokens(pinnedAssets, cwd),
  );

  /**
   * Check whether a CWD has project-local assets (.minimalist-agent/agents/ or skills/).
   * Used to decide whether to show the new-session discovery card.
   */
  ipcMain.handle('context:hasProjectAssets', (_e, cwd: string): boolean => {
    const base = join(cwd, '.minimalist-agent');
    return (
      existsSync(join(base, 'agents')) ||
      existsSync(join(base, 'skills'))
    );
  });
}
