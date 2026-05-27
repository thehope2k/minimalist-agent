/**
 * Collaboration tools for intelligent agent autonomy.
 * 
 * These tools allow the LLM to engage the user when collaboration would be
 * valuable - for complex decisions, subjective preferences, risky operations,
 * trade-off discussions, or work validation.
 * 
 * LLM decides WHEN to use these based on context, complexity, and autonomy level.
 */

/**
 * Engagement types for user collaboration.
 */
export type EngagementType = 'decision' | 'preference' | 'feedback' | 'guidance' | 'approval';

/**
 * Request for user engagement - sent to renderer via IPC.
 */
export interface EngagementRequest {
  reqId: string;
  turnId: string;
  sessionId: string;
  type: EngagementType;
  payload: DecisionPayload | PreferencePayload | FeedbackPayload | GuidancePayload | ApprovalPayload;
}

/**
 * Common building blocks for collaboration payloads.
 */
export interface NamedOption {
  name: string;
  description: string;
}

export interface TradeOffAnalysis {
  pros: string[];
  cons: string[];
}

/**
 * Alternative with trade-off analysis (for decisions).
 */
export type Alternative = NamedOption & TradeOffAnalysis;

/**
 * Trade-off option (for guidance).
 */
export interface TradeOff extends TradeOffAnalysis {
  option: string;
}

export interface DecisionPayload {
  question: string;
  alternatives: Alternative[];
  recommended?: string;
  context?: string;
}

export interface PreferencePayload {
  question: string;
  options: NamedOption[];
  context?: string;
}

export interface FeedbackPayload {
  work_completed: string;
  preview?: string;
  specific_questions?: string[];
}

export interface GuidancePayload {
  situation: string;
  trade_offs: TradeOff[];
  what_guidance_needed: string;
}

export interface ApprovalPayload {
  operation: string;
  risk_level: number;
  risk_factors: string[];
  reason: string;
  details?: Record<string, unknown>;
}

/**
 * User's response to an engagement request.
 */
export interface EngagementResponse {
  reqId: string;
  decision: 'approved' | 'denied' | 'custom';
  selected_option?: string;
  custom_response?: string;
  feedback?: string;
}
