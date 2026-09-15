// Local configuration copying for isolated agent worktrees.
import { join, dirname } from 'node:path';
import { existsSync, mkdirSync, copyFileSync, readFileSync, readdirSync } from 'node:fs';
import { minimatch } from 'minimatch';
import type { Logger } from '../../../shared/log';
import { execFileAsync } from './worktree-git';

export function createWorktreeIncludeHelpers(log: Logger) {
  /* ============================================================ */
  /*  .worktreeinclude support                                    */
  /* ============================================================ */

  /**
   * Read and parse .worktreeinclude patterns.
   * Returns array of glob patterns for files to copy.
   */
  function readWorktreeInclude(baseCwd: string): string[] {
    const includeFile = join(baseCwd, '.worktreeinclude');

    if (!existsSync(includeFile)) {
      // No config file - return sensible defaults
      return ['.env', '.env.local', '.npmrc', '.mvn/settings.xml'];
    }

    try {
      const content = readFileSync(includeFile, 'utf-8');
      return content
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#')); // Skip comments and empty lines
    } catch (err) {
      log.warn('Failed to read .worktreeinclude:', err);
      return [];
    }
  }

  /**
   * Check if a file is gitignored.
   */
  async function isGitIgnored(filepath: string, cwd: string): Promise<boolean> {
    try {
      await execFileAsync('git', ['check-ignore', '--', filepath], { cwd });
      return true; // Exit code 0 = file is ignored
    } catch {
      return false; // Exit code 1 = file is NOT ignored
    }
  }

  /**
   * Find all files matching patterns and copy them to worktree.
   */
  async function copyWorktreeIncludes(baseCwd: string, worktreePath: string): Promise<void> {
    const patterns = readWorktreeInclude(baseCwd);
    if (patterns.length === 0) {
      return;
    }

    log.debug(`Copying config files: ${patterns.join(', ')}`);

    for (const pattern of patterns) {
      // Handle both glob patterns and direct file paths
      const isGlob = pattern.includes('*') || pattern.includes('?');

      if (isGlob) {
        // Glob pattern - find all matching files
        const matches = findFilesMatchingPattern(baseCwd, pattern);
        for (const match of matches) {
          await copyFileIfGitIgnored(baseCwd, worktreePath, match);
        }
      } else {
        // Direct file path
        await copyFileIfGitIgnored(baseCwd, worktreePath, pattern);
      }
    }
  }

  /**
   * Find all files matching a glob pattern.
   */
  function findFilesMatchingPattern(baseCwd: string, pattern: string): string[] {
    const matches: string[] = [];

    function searchDir(dir: string, baseDir: string = baseCwd) {
      try {
        const entries = readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = join(dir, entry.name);
          const relativePath = fullPath.substring(baseDir.length + 1);

          // Skip .git and node_modules
          if (entry.name === '.git' || entry.name === 'node_modules') {
            continue;
          }

          if (entry.isDirectory()) {
            searchDir(fullPath, baseDir);
          } else if (minimatch(relativePath, pattern)) {
            matches.push(relativePath);
          }
        }
      } catch (err) {
        // Ignore permission errors, etc.
      }
    }

    searchDir(baseCwd);
    return matches;
  }

  /**
   * Copy a file only if it's gitignored (safety check).
   */
  async function copyFileIfGitIgnored(
    baseCwd: string,
    worktreePath: string,
    relativePath: string,
  ): Promise<void> {
    const sourcePath = join(baseCwd, relativePath);

    if (!existsSync(sourcePath)) {
      return; // File doesn't exist
    }

    // Safety check: only copy gitignored files
    const isIgnored = await isGitIgnored(relativePath, baseCwd);
    if (!isIgnored) {
      log.warn(`Skipping ${relativePath} (not gitignored)`);
      return;
    }

    const destPath = join(worktreePath, relativePath);

    try {
      // Ensure parent directory exists
      mkdirSync(dirname(destPath), { recursive: true });

      // Copy file
      copyFileSync(sourcePath, destPath);
      log.debug(`Copied ${relativePath}`);
    } catch (err) {
      log.warn(`Failed to copy ${relativePath}:`, err);
    }
  }

  return { copyWorktreeIncludes };
}
