import type { CanUseTool, PermissionMode as SdkPermissionMode } from '@anthropic-ai/claude-agent-sdk';
import type { PermissionMode } from '../storage/settings';
import { isSafeBashCommand } from './safe-bash';

export type { PermissionMode };

/* ---- mode mapping ---------------------------------------------- */

export function toSdkPermissionMode(mode: PermissionMode): SdkPermissionMode {
  switch (mode) {
    case 'plan':
      return 'plan';
    case 'auto':
      return 'bypassPermissions';
    case 'ask':
    default:
      return 'default';
  }
}

/**
 * Read-only / safe-by-design tools that we never prompt for, even in ask
 * mode. The threat model is mutation; reading the project, listing files,
 * managing the agent's own todo list, and pulling web content cannot
 * change the user's filesystem.
 *
 * Bash is handled separately — safe bash commands are auto-allowed via
 * `isSafeBashCommand()` in the `makeCanUseTool` callback below, rather
 * than by unconditionally allowing all bash invocations.
 */
const READ_ONLY_TOOLS: ReadonlySet<string> = new Set([
  'Read',
  'Glob',
  'Grep',
  'LS',
  'WebFetch',
  'WebSearch',
  'TodoWrite',
  'NotebookRead',
]);

/* ---- prompt round-trip ----------------------------------------- */

export type PermissionDecision = 'allow_once' | 'allow_session' | 'deny';

export interface PermissionRequest {
  /** Stable id for matching the renderer's response back to this request. */
  reqId: string;
  /** Owning chat turn id (the assistant message id from chat:send). */
  turnId: string;
  sessionId: string;
  toolName: string;
  input: Record<string, unknown>;
}

/**
 * Caller supplies this. It MUST resolve to a decision (or throw if the
 * request is cancelled — we'll treat that as `deny`).
 */
export type AskRenderer = (req: PermissionRequest) => Promise<PermissionDecision>;

/* ---- per-session allow memory ---------------------------------- */

const sessionAllow = new Map<string, Set<string>>();

function allowKey(toolName: string, input: Record<string, unknown>): string {
  return `${toolName}:${stableStringify(input)}`;
}

/** Drop a session's remembered approvals (called when a session is deleted). */
export function clearSessionAllow(sessionId: string): void {
  sessionAllow.delete(sessionId);
}

/* ---- the factory ----------------------------------------------- */

export interface BridgeArgs {
  sessionId: string;
  /** Chat turn id — propagated into permission requests so the UI can scope. */
  turnId: string;
  ask: AskRenderer;
}

/**
 * Build the `canUseTool` callback for one chat turn. The callback closes
 * over the per-turn askRenderer + per-session allow set.
 */
export function makeCanUseTool({ sessionId, turnId, ask }: BridgeArgs): CanUseTool {
  return async (toolName, input, { signal }) => {
    if (READ_ONLY_TOOLS.has(toolName)) {
      return { behavior: 'allow', updatedInput: input };
    }

    // Auto-allow Bash commands that are provably read-only (git status, ls,
    // grep, etc.) so the agent can explore a codebase without a confirmation
    // click for every safe command in 'ask' mode.
    if (toolName === 'Bash') {
      const command = typeof (input as Record<string, unknown>)?.command === 'string'
        ? (input as Record<string, unknown>).command as string
        : '';
      if (command && isSafeBashCommand(command)) {
        return { behavior: 'allow', updatedInput: input };
      }
    }

    const set = sessionAllow.get(sessionId);
    const key = allowKey(toolName, input);
    if (set && set.has(key)) {
      return { behavior: 'allow', updatedInput: input };
    }

    if (signal.aborted) {
      return { behavior: 'deny', message: 'Aborted' };
    }

    const reqId = `perm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    let decision: PermissionDecision;
    try {
      decision = await ask({ reqId, turnId, sessionId, toolName, input });
    } catch {
      // Renderer disconnected, app closing, or the prompt was cancelled.
      return { behavior: 'deny', message: 'Permission prompt cancelled' };
    }

    if (decision === 'deny') {
      return { behavior: 'deny', message: 'User denied this action' };
    }
    if (decision === 'allow_session') {
      let s = sessionAllow.get(sessionId);
      if (!s) {
        s = new Set();
        sessionAllow.set(sessionId, s);
      }
      s.add(key);
    }
    return { behavior: 'allow', updatedInput: input };
  };
}

/* ---- helpers --------------------------------------------------- */

/**
 * Order-stable JSON for hashing tool inputs. We sort top-level keys; nested
 * structures keep their insertion order (good enough — the SDK produces
 * inputs from JSON Schema and the order is stable across calls).
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(
    ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0),
  );
  return `{${entries
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`)
    .join(',')}}`;
}
