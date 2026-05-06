import { exec as execCb } from 'node:child_process';
import { execFile as execFileCb } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { scanForEntities } from './scan';
import { SPECKIT_VERSION } from './version';

const exec = promisify(execCb);
const execFile = promisify(execFileCb);

// Portable install command — does not hardcode the Homebrew prefix so it works
// on Apple Silicon (/opt/homebrew), Intel Mac (/usr/local), and Linux (~/.local).
// Users who don't have uv on PATH can install it first: https://docs.astral.sh/uv/
const CLI_INSTALL_CMD =
  `uv tool install specify-cli --from "git+https://github.com/github/spec-kit.git@v${SPECKIT_VERSION}"`;

/**
 * Run `specify init . --integration claude` in `targetDir`.
 * Returns success/error without leaving partial state on failure.
 *
 * All shell invocations are async so the Electron main-process event loop
 * is never blocked (previously used execSync which froze the window for up
 * to 30 s during `specify init`).
 */
export async function runSpecifyInit(
  targetDir: string,
): Promise<{ success: boolean; error?: string; installCmd?: string }> {
  // Check for existing .specify/
  const { entities } = await scanForEntities(targetDir);
  if (entities.length > 0) {
    return {
      success: false,
      error: `SDD already initialized — found .specify/ at ${entities[0].rootPath}`,
    };
  }

  // Check CLI availability with async execFile.
  try {
    await execFile('specify', ['version'], { timeout: 3000 });
  } catch {
    return {
      success: false,
      error: 'The specify CLI was not found on PATH.',
      installCmd: CLI_INSTALL_CMD,
    };
  }

  try {
    // `echo "y" | specify init .` feeds the interactive "proceed?" prompt.
    // `exec` (not execFile) is used to support the shell pipe operator.
    await exec('echo "y" | specify init . --integration claude', {
      cwd: targetDir,
      timeout: 30_000,
    });

    // Always add Pi integration so the project works for both Anthropic
    // and Copilot/Pi backend sessions in Minimalist Agent.
    try {
      await execFile('specify', ['integration', 'add', 'pi'], {
        cwd: targetDir,
        timeout: 15_000,
      });
    } catch {
      // Pi integration failure is non-fatal — Claude still works.
      // User can add Pi manually: `specify integration add pi`
    }

    return { success: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);

    // Roll back any partial state using fs.rmSync — avoids shell-string
    // injection risks of `rm -rf "${specifyDir}"`.
    const specifyDir = join(targetDir, '.specify');
    if (existsSync(specifyDir)) {
      try {
        rmSync(specifyDir, { recursive: true, force: true });
      } catch { /* ignore cleanup error */ }
    }

    return { success: false, error: msg };
  }
}
