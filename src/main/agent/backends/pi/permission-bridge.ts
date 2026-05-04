// Glue between the Pi subprocess's `pre_tool_use_request` JSONL message
// and the existing `makeCanUseTool()` infrastructure used by the
// Anthropic backend. Same UI prompt, same allow-once / allow-session /
// deny semantics — Copilot turns get the same UX as Claude turns.

import type {
  AskRenderer,
  PermissionDecision,
} from '../../permissions';
import type { PiPermissionMode } from './protocol';
import { READ_ONLY_TOOL_NAMES } from './protocol';
import { isSafeBashCommand } from '../../safe-bash';

const sessionAllow = new Map<string, Set<string>>();

function allowKey(toolName: string, input: unknown): string {
  return `${toolName}:${stableStringify(input)}`;
}

/** Drop a session's remembered approvals. Mirrors permissions.clearSessionAllow. */
export function clearPiSessionAllow(sessionId: string): void {
  sessionAllow.delete(sessionId);
}

export interface PiPermissionDecisionArgs {
  mode: PiPermissionMode;
  sessionId: string;
  turnId: string;
  toolName: string;
  input: unknown;
  ask: AskRenderer;
}

export interface PiPermissionResolution {
  action: 'allow' | 'block';
  reason?: string;
}

/**
 * Decide whether a tool call may execute. Mirrors `makeCanUseTool` shape
 * but keyed off Pi's flat tool names.
 *
 *   auto → allow everything
 *   ask  → read-only auto-allowed; everything else round-trips through the
 *          renderer's permission UI; "Allow for session" is remembered
 *   plan → only read-only tools allowed; everything else blocked with a
 *          message that nudges the model toward a planning answer
 */
export async function decidePiPermission(
  args: PiPermissionDecisionArgs,
): Promise<PiPermissionResolution> {
  const isReadOnly = READ_ONLY_TOOL_NAMES.has(args.toolName.toLowerCase());

  if (args.mode === 'auto') {
    return { action: 'allow' };
  }

  if (args.mode === 'plan') {
    if (isReadOnly) return { action: 'allow' };

    const toolName = args.toolName.toLowerCase();
    let reason: string;

    if (toolName === 'bash') {
      const inp = args.input as Record<string, unknown> | null | undefined;
      const command = typeof inp?.command === 'string' ? inp.command : '';
      reason =
        `Plan mode is active — the bash tool is not available. ` +
        (command
          ? `Instead of \`${command}\`, use the read / grep / find / ls / glob tools for exploration. `
          : `Use the read / grep / find / ls / glob tools for exploration. `) +
        `Switch to Ask mode if you need to run shell commands.`;
    } else {
      reason =
        `Plan mode is active — "${args.toolName}" is not available. ` +
        `Only read / grep / find / ls / glob / web_fetch / web_search may run. ` +
        `Reply with the plan as text instead of calling this tool.`;
    }

    return { action: 'block', reason };
  }

  // ask
  if (isReadOnly) return { action: 'allow' };

  // Auto-allow safe bash commands (git status, ls, grep, etc.) so the agent
  // can explore a codebase without a confirmation click for every read-only
  // command. Dangerous syntax ($(), redirects, etc.) is rejected by
  // isSafeBashCommand regardless of this path.
  if (args.toolName.toLowerCase() === 'bash') {
    const inp = args.input as Record<string, unknown> | null | undefined;
    const command = typeof inp?.command === 'string' ? inp.command : '';
    if (command && isSafeBashCommand(command)) {
      return { action: 'allow' };
    }
  }

  const set = sessionAllow.get(args.sessionId);
  const key = allowKey(args.toolName, args.input);
  if (set && set.has(key)) return { action: 'allow' };

  const reqId = `pi_perm_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  let decision: PermissionDecision;
  try {
    decision = await args.ask({
      reqId,
      turnId: args.turnId,
      sessionId: args.sessionId,
      toolName: args.toolName,
      input: (args.input ?? {}) as Record<string, unknown>,
    });
  } catch {
    return { action: 'block', reason: 'Permission prompt cancelled' };
  }

  if (decision === 'deny') {
    return { action: 'block', reason: 'User denied this action' };
  }
  if (decision === 'allow_session') {
    let s = sessionAllow.get(args.sessionId);
    if (!s) {
      s = new Set();
      sessionAllow.set(args.sessionId, s);
    }
    s.add(key);
  }
  return { action: 'allow' };
}

/* ---- helpers --------------------------------------------------- */

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
