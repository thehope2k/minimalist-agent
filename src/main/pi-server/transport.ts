// stdio framing — the single write path to stdout, which is reserved for the
// JSONL protocol (stderr is for logs). Kept in its own file since almost
// every pi-server module needs to send a message back to main.
import type { SubprocessOutbound } from '../agent-runtime/backends/pi/protocol';

export function send(msg: SubprocessOutbound): void {
  process.stdout.write(JSON.stringify(msg) + '\n');
}
