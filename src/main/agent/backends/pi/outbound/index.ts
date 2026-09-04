// Thin dispatcher for subprocess→main messages (`SubprocessOutbound`).
// Each message type's actual handling lives in a sibling module grouped by
// concern (lifecycle, permissions, collaboration, planning, auth, browser,
// mcp, mini/llm one-shots) — see agent.ts's module header for the protocol
// this bridges.
import type { SubprocessHandle } from '../subprocess-handle';
import type {
  MsgAuthRefreshRequest,
  MsgAuthRequired,
  MsgBrowserToolRequest,
  MsgCollaborationRequest,
  MsgEvent,
  MsgLlmQueryResult,
  MsgMcpStatus,
  MsgMiniCompletionResult,
  MsgPreToolUseRequest,
  MsgReady,
  MsgSessionIdUpdate,
  SubprocessOutbound,
} from '../protocol';
import { handleEvent, handleOperationUpdate, handleReady, handleSubprocessFatalError } from './lifecycle';
import { handlePermissionModeChanged, handlePreToolUseRequest } from './permissions';
import { handleCollaborationRequest } from './collaboration';
import {
  handlePlanApprovalRequired,
  handlePlanCompletedOrCancelled,
  handlePlanCreatedOrUpdated,
  handlePlanError,
  handlePlanPhaseUpdated,
  handlePlanRevised,
} from './planning';
import { handleAuthRefreshRequest, handleAuthRequired, handleSessionIdUpdate } from './auth';
import { handleBrowserToolRequest } from './browser';
import { handleMcpStatus } from './mcp';
import { handleLlmQueryResult, handleMiniCompletionResult } from './mini-llm';

export async function dispatchOutbound(
  msg: SubprocessOutbound,
  handle: SubprocessHandle,
  resolveReady: () => void,
  rejectReady: (e: Error) => void,
): Promise<void> {
  switch (msg.type) {
    case 'ready':
      return handleReady(msg as MsgReady, handle, resolveReady);

    case 'operation_update':
      return handleOperationUpdate(msg, handle);

    case 'event':
      return handleEvent(msg as MsgEvent, handle);

    case 'pre_tool_use_request':
      return handlePreToolUseRequest(msg as MsgPreToolUseRequest, handle);

    case 'collaboration_request':
      return handleCollaborationRequest(msg as MsgCollaborationRequest, handle);

    // Planning workflow events — forward to renderer via IPC and update cache.
    case 'planning:created':
    case 'planning:updated':
      return handlePlanCreatedOrUpdated(msg, handle);

    case 'planning:phase-updated':
      return handlePlanPhaseUpdated(msg, handle);

    case 'planning:revised':
      return handlePlanRevised(msg, handle);

    case 'planning:completed':
    case 'planning:cancelled':
      return handlePlanCompletedOrCancelled(msg, handle);

    case 'planning:error':
      return handlePlanError(msg, handle);

    case 'planning:approval-required':
      return handlePlanApprovalRequired(msg, handle);

    case 'permission_mode_changed':
      return handlePermissionModeChanged(msg, handle);

    case 'session_id_update':
      return handleSessionIdUpdate(msg as MsgSessionIdUpdate, handle);

    case 'auth_refresh_request':
      return handleAuthRefreshRequest(msg as MsgAuthRefreshRequest, handle);

    case 'browser_tool_request':
      return handleBrowserToolRequest(msg as MsgBrowserToolRequest, handle);

    case 'mcp_status':
      return handleMcpStatus(msg as MsgMcpStatus, handle);

    case 'mini_completion_result':
      return handleMiniCompletionResult(msg as MsgMiniCompletionResult, handle);

    case 'llm_query_result':
      return handleLlmQueryResult(msg as MsgLlmQueryResult, handle);

    case 'auth_required':
      return handleAuthRequired(msg as MsgAuthRequired, handle);

    case 'error':
      return handleSubprocessFatalError(msg as { message: string }, handle, rejectReady);
  }
}
