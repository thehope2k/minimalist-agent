// Tool-use permission gating: per-turn pre_tool_use_request decisions
// (plan-mode read-only guard + extension blocklist) and permission-mode
// switches (plan → auto) propagated to active turns + session meta.
import { BrowserWindow } from 'electron';
import { isMcpToolNameBlocked } from '../../../extensions/tool-permissions';
import { updateSessionMeta } from '../../../storage/sessions';
import { createLogger } from '../../../logger';
import { send, type SubprocessHandle } from '../subprocess-handle';
import type { MsgPreToolUseRequest } from '../protocol';

const log = createLogger('chat-runtime');

export function handlePreToolUseRequest(msg: MsgPreToolUseRequest, handle: SubprocessHandle): void {
  const ctx = handle.permissionContext.get(msg.turnId);
  if (!ctx) {
    // No context registered → block conservatively. Should not happen
    // in a normal flow, but covers a stray request after turn end.
    send(handle, {
      type: 'pre_tool_use_response',
      requestId: msg.requestId,
      action: 'block',
      reason: 'No permission context for this turn',
    });
    return;
  }
  const decision: { action: 'allow' | 'block'; reason?: string } = { action: 'allow', reason: undefined };

  // Server-declared tool blocklist (extension.json permissions.blockedTools)
  // applies regardless of permission mode — it's a capability boundary,
  // not a plan/auto approval concern.
  if (isMcpToolNameBlocked(msg.toolName, ctx.cwd)) {
    decision.action = 'block';
    decision.reason = `"${msg.toolName}" is blocked by its extension's permissions.blockedTools`;
  }

  // In plan mode, block write operations
  if (decision.action === 'allow' && ctx.mode === 'plan') {
    // browser_tool is intentionally NOT exempt: unlike Read/Grep/Find/Ls it can
    // click/fill/submit/evaluate against a real, remote page, so plan mode's
    // "block write operations" contract has to cover it like any other tool
    // with side effects.
    const readOnlyTools = new Set(['Read', 'Grep', 'Find', 'Ls']);
    if (!readOnlyTools.has(msg.toolName)) {
      decision.action = 'block';
      decision.reason = 'Plan mode: write operations not allowed';
    }
  }
  // In auto mode, allow all tools (agent uses collaboration tools for engagement)

  send(handle, {
    type: 'pre_tool_use_response',
    requestId: msg.requestId,
    action: decision.action,
    reason: decision.reason,
  });
}

export function handlePermissionModeChanged(msg: { sessionId?: string; mode: any }, handle: SubprocessHandle): void {
  const sessionId = msg.sessionId ?? handle.chatSessionId;
  const mode = msg.mode;

  // CRITICAL: Update permission context for all active turns
  // When user approves a phase in plan mode, we switch to auto,
  // but the turn's permission context is cached from turn start.
  // Without this update, tools still get blocked by the plan mode guard.
  for (const ctx of handle.permissionContext.values()) {
    if (ctx.sessionId === sessionId) {
      ctx.mode = mode;
    }
  }

  // Update session metadata to persist the mode change
  try {
    updateSessionMeta(sessionId, { permissionMode: mode });
  } catch (e) {
    log.error('Failed to persist permission mode:', e);
  }

  // Forward to renderer to update UI
  const win = BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) {
    win.webContents.send('permission-mode-changed', { sessionId, mode });
  }
}
