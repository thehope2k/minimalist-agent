// send() primitive shared by handle-registry.ts (shutdown) and subprocess.ts
// (init/prompt) — kept separate from both so neither needs to import the
// other and create a cycle.
import { createLogger } from '../../../../shared/sub-logger';
import { writeJsonLine } from '../../../../shared/jsonl-stdin';
import type { SubprocessInbound } from '../protocol';
import type { SpawnedAgentHandle } from './types';

const log = createLogger('agent-tool');

export function send(handle: SpawnedAgentHandle, msg: SubprocessInbound): void {
  writeJsonLine(handle.child.stdin, msg, log.child({ execId: handle.execId }));
}
