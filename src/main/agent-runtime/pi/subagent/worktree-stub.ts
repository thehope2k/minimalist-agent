// Process-safe worktree facade for pi-server. The shared manager contains no
// Electron imports; this facade supplies the subprocess logger before exposing
// its lifecycle functions to the sub-agent runtime.
import { createLogger } from '../../../../shared/sub-logger';
import { configureWorktreeLogger } from '../worktree-manager';

configureWorktreeLogger(createLogger('worktree'));

export {
  createAgentWorktree,
  removeAgentWorktree,
  cleanupAllWorktrees,
  cleanupOrphanedWorktrees,
} from '../worktree-manager';
