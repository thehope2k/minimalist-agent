// Shared per-subprocess state + the `send()` primitive, factored out of
// agent.ts so outbound-message handlers (outbound/*.ts) can be typed against
// `SubprocessHandle` without importing agent.ts's spawn/lifecycle logic.
import type { ChildProcess } from 'node:child_process';
import type { Interface as ReadlineInterface } from 'node:readline';
import { createLogger } from '../../logger';
import { writeJsonLine } from '../../../shared/jsonl-stdin';
import type { AgentChatEvent } from '../events';
import type { PermissionMode } from '../permissions';
import type { CollaborationAsk } from '../../../shared/collaboration-types';
import type {
  MsgLlmQueryResult,
  MsgMiniCompletionResult,
  ThinkingLevel,
  ModelProvider,
  SubprocessInbound,
} from './protocol';

const log = createLogger('chat-runtime');

/* ============================================================ */
/*  Async event queue                                             */
/* ============================================================ */

export class EventQueue {
  private buf: AgentChatEvent[] = [];
  private resolvers: Array<(v: AgentChatEvent | null) => void> = [];
  private done = false;

  push(ev: AgentChatEvent): void {
    if (this.done) return;
    const r = this.resolvers.shift();
    if (r) r(ev);
    else this.buf.push(ev);
  }

  finish(): void {
    this.done = true;
    while (this.resolvers.length) this.resolvers.shift()!(null);
  }

  next(): Promise<AgentChatEvent | null> {
    if (this.buf.length) return Promise.resolve(this.buf.shift()!);
    if (this.done) return Promise.resolve(null);
    return new Promise((res) => this.resolvers.push(res));
  }
}

/* ============================================================ */
/*  Subprocess handle                                            */
/* ============================================================ */

export interface SubprocessHandle {
  child: ChildProcess;
  rl: ReadlineInterface;
  ready: Promise<void>;
  /** turnId → event queue. */
  queues: Map<string, EventQueue>;
  /** turnId → permission context (mode + sessionId + cwd). */
  permissionContext: Map<
    string,
    { mode: PermissionMode; sessionId: string; cwd?: string }
  >;
  /** turnId → the request's AbortSignal, so a mid-turn round-trip to main
   *  (e.g. an auth_refresh_request triggered by the subprocess) can be
   *  cancelled the moment the user hits Stop, not just bounded by a ceiling. */
  turnSignals: Map<string, AbortSignal>;
  /** RequestId → resolver for mini_completion / llm_query. */
  pendingMini: Map<
    string,
    { resolve: (r: MsgMiniCompletionResult) => void }
  >;
  pendingLlm: Map<
    string,
    { resolve: (r: MsgLlmQueryResult) => void }
  >;
  stderrBuffer: string[];
  /** The chat session this subprocess serves. */
  chatSessionId: string;
  /** Connection slug, captured at spawn so refresh can mutex per-slug. */
  connectionSlug: string;
  /** Model provider used for auth refresh and diagnostics. */
  provider: ModelProvider;
  /** True while a token refresh is in progress for this handle. */
  refreshing?: boolean;
  /** Model ID currently active in the subprocess. */
  currentModel?: string;
  /** Thinking level currently active in the subprocess. */
  currentThinkingLevel?: ThinkingLevel;
  /** Collaboration callback to show engagement dialogs. */
  askCollaboration?: CollaborationAsk;
  /** Count of in-flight collaboration_request calls awaiting a human response
   *  (RequestApproval/Decision/Preference/Guidance/Feedback). While > 0 the
   *  subprocess is deliberately silent — waiting on the user, not stuck — so
   *  the idle watchdog must not reap it. Safe to leak on a discarded handle:
   *  every SubprocessHandle is freshly constructed by spawnSubprocess (never
   *  pooled/reused), and handles.delete is always identity-checked, so a
   *  stale count can never suppress the watchdog for a future handle. */
  pendingCollaborationRequests: number;
  /** Timestamp of the last stdout line received from this subprocess. */
  lastActivityAt: number;
  /** Subprocess-reported label of whatever long-running operation is in
   *  flight (e.g. 'model_call', 'oauth_refresh', 'tool:Bash'), or undefined
   *  when idle between operations. Surfaced by the watchdog on force-recovery. */
  currentOperation?: string;
}

export function send(handle: SubprocessHandle, msg: SubprocessInbound): void {
  writeJsonLine(handle.child.stdin, msg, log);
}
