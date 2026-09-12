/**
 * Plan cache - shared state for active plans.
 * 
 * Separate module to avoid circular dependencies between ipc.ts and the agent runtime.
 */

import { PlanStorage } from './planning/storage';

/**
 * Active plans cache - tracks the latest plan state per session.
 * Updated via planning events from pi-server subprocess and restored on demand
 * when a persisted session is reopened.
 */
const activePlans = new Map<string, any>(); // sessionId -> Plan

/**
 * Get the active plan for a session.
 */
export function getActivePlan(sessionId: string): any | null {
  return activePlans.get(sessionId) || null;
}

/** Restore a persisted plan into the cache when a session is opened after the
 * app or its pi-server subprocess has restarted. */
export function restorePlanCache(sessionId: string, sessionsDir: string): any | null {
  const cached = getActivePlan(sessionId);
  if (cached) return cached;

  const plan = new PlanStorage(sessionsDir).loadPlan(sessionId);
  if (plan) activePlans.set(sessionId, plan);
  return plan;
}

/**
 * Update the active plan cache.
 */
export function updatePlanCache(sessionId: string, plan: any | null): void {
  if (plan) {
    activePlans.set(sessionId, plan);
  } else {
    activePlans.delete(sessionId);
  }
}

/**
 * Clear all plans (e.g., on app shutdown).
 */
