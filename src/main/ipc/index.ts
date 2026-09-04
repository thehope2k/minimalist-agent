// Composition root for all `ipcMain` registrations. Each domain lives in its
// own `*-ipc.ts` module (auth, chat, sessions, files, git, …) so that a
// change to one domain doesn't require reading/touching the others. See
// AGENTS.md → "Process boundaries" for the renderer/main IPC contract.
import { registerAppIpc } from './app-ipc';
import { registerOAuthIpc } from './oauth-ipc';
import { registerChatIpc } from './chat-ipc';
import { registerPlanningIpc } from './planning-ipc';
import { registerConnectionsIpc } from './connections-ipc';
import { registerPreferencesIpc } from './preferences-ipc';
import { registerSessionsIpc } from './sessions-ipc';
import { registerProjectsIpc } from './projects-ipc';
import { registerFilesIpc } from './files-ipc';
import { registerAssetsIpc } from './assets-ipc';
import { registerGitIpc } from './git-ipc';
import { registerTerminalIpc } from './terminal-ipc';
import { registerBrowserIpc } from './browser-ipc';
import { registerVoiceIpc } from './voice-ipc';

export type { ChatSendRequest } from './chat-ipc';

export function registerIpc(): void {
  registerAppIpc();
  registerOAuthIpc();
  registerChatIpc();
  registerPlanningIpc();
  registerConnectionsIpc();
  registerPreferencesIpc();
  registerSessionsIpc();
  registerProjectsIpc();
  registerFilesIpc();
  registerAssetsIpc();
  registerGitIpc();
  registerTerminalIpc();
  registerBrowserIpc();
  registerVoiceIpc();
}
