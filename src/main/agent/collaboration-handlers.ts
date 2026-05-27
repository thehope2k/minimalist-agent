/**
 * Collaboration tool handlers.
 * 
 * These functions handle collaboration tool calls from the LLM, showing
 * appropriate UI dialogs and returning user responses.
 */

import type {
  EngagementRequest,
  EngagementResponse,
  DecisionPayload,
  PreferencePayload,
  FeedbackPayload,
  GuidancePayload,
  ApprovalPayload,
} from '../../shared/collaboration-types';

/**
 * Context passed to collaboration handlers.
 */
export interface CollaborationContext {
  sessionId: string;
  turnId: string;
  autonomyLevel: number;
  askRenderer: (request: EngagementRequest) => Promise<EngagementResponse>;
}

/**
 * Handle RequestDecision tool call.
 */
export async function handleRequestDecision(
  payload: DecisionPayload,
  context: CollaborationContext,
): Promise<{ selected: string; custom_response?: string }> {
  const reqId = `decision-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const request: EngagementRequest = {
    reqId,
    turnId: context.turnId,
    sessionId: context.sessionId,
    type: 'decision',
    payload,
  };
  
  const response = await context.askRenderer(request);
  
  return {
    selected: response.selected_option || response.custom_response || 'no_selection',
    custom_response: response.custom_response,
  };
}

/**
 * Handle RequestPreference tool call.
 */
export async function handleRequestPreference(
  payload: PreferencePayload,
  context: CollaborationContext,
): Promise<{ selected: string; custom_response?: string }> {
  const reqId = `preference-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const request: EngagementRequest = {
    reqId,
    turnId: context.turnId,
    sessionId: context.sessionId,
    type: 'preference',
    payload,
  };
  
  const response = await context.askRenderer(request);
  
  return {
    selected: response.selected_option || response.custom_response || 'no_selection',
    custom_response: response.custom_response,
  };
}

/**
 * Handle RequestFeedback tool call.
 */
export async function handleRequestFeedback(
  payload: FeedbackPayload,
  context: CollaborationContext,
): Promise<{ feedback: string }> {
  const reqId = `feedback-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const request: EngagementRequest = {
    reqId,
    turnId: context.turnId,
    sessionId: context.sessionId,
    type: 'feedback',
    payload,
  };
  
  const response = await context.askRenderer(request);
  
  return {
    feedback: response.feedback || response.custom_response || 'No feedback provided',
  };
}

/**
 * Handle RequestGuidance tool call.
 */
export async function handleRequestGuidance(
  payload: GuidancePayload,
  context: CollaborationContext,
): Promise<{ guidance: string }> {
  const reqId = `guidance-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const request: EngagementRequest = {
    reqId,
    turnId: context.turnId,
    sessionId: context.sessionId,
    type: 'guidance',
    payload,
  };
  
  const response = await context.askRenderer(request);
  
  return {
    guidance: response.custom_response || 'No guidance provided',
  };
}

/**
 * Handle RequestApproval tool call.
 */
export async function handleRequestApproval(
  payload: ApprovalPayload,
  context: CollaborationContext,
): Promise<{ approved: boolean; reason?: string }> {
  const reqId = `approval-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const request: EngagementRequest = {
    reqId,
    turnId: context.turnId,
    sessionId: context.sessionId,
    type: 'approval',
    payload,
  };
  
  const response = await context.askRenderer(request);
  
  return {
    approved: response.decision === 'approved',
    reason: response.custom_response,
  };
}


