// Sub-agent invocations (Agent tool) get an isolated transcript storage
// directory nested under their parent session — see AGENTS.md's IPC/process
// boundary rule: this file must stay electron-free because it's imported by
// both the main process (storage/sessions.ts, for pruning) and the pi-server
// subprocess (agent/backends/pi/agent-tool.ts, for writing), which is built
// and run without Electron APIs.
import { join } from 'node:path';

export const SUBAGENT_DIR_NAME = '.agents';

/** Isolated transcript storage path for one sub-agent invocation. */
export function subagentDir(sessionDirPath: string, execId: string): string {
  return join(sessionDirPath, SUBAGENT_DIR_NAME, execId);
}
