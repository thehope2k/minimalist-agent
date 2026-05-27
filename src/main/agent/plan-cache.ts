/**
 * Plan cache - shared state for active plans.
 * 
 * Separate module to avoid circular dependencies between ipc.ts and agent backends.
 */

/**
 * Active plans cache - tracks the latest plan state per session.
 * Updated via planning events from pi-server subprocess.
 */
const activePlans = new Map<string, any>(); // sessionId -> Plan

/**
 * Get the active plan for a session.
 */
export function getActivePlan(sessionId: string): any | null {
  return activePlans.get(sessionId) || null;
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
