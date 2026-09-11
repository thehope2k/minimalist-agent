// Planning workflow events forwarded from the pi-server subprocess's
// PlanManager: cache updates (agent/plan-cache.ts, queried by
// `planning:getActivePlan` IPC) + renderer notification for each event type.
import { BrowserWindow } from 'electron';
import { getActivePlan as getCachedPlan, updatePlanCache } from '../../plan-cache';
import type { SubprocessHandle } from '../subprocess-handle';

function broadcast(type: string, payload: Record<string, unknown>): void {
  const win = BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) {
    win.webContents.send(type, payload);
  }
}

export function handlePlanCreatedOrUpdated(msg: any, handle: SubprocessHandle): void {
  const { plan, sessionId = handle.chatSessionId } = msg;
  if (!plan) return;
  // Update the cache so getActivePlan returns the latest state.
  updatePlanCache(sessionId, plan);
  broadcast(msg.type, { sessionId, plan });
}

export function handlePlanPhaseUpdated(msg: any, handle: SubprocessHandle): void {
  const { sessionId = handle.chatSessionId, planId, phase } = msg;
  // Update the cached plan's phase.
  const cachedPlan = getCachedPlan(sessionId);
  if (cachedPlan && cachedPlan.id === planId) {
    const phaseIndex = cachedPlan.phases.findIndex((p: any) => p.id === phase.id);
    if (phaseIndex >= 0) {
      cachedPlan.phases[phaseIndex] = phase;
      updatePlanCache(sessionId, cachedPlan);
    }
  }
  broadcast(msg.type, { sessionId, planId, phase });
}

export function handlePlanRevised(msg: any, handle: SubprocessHandle): void {
  const { sessionId = handle.chatSessionId, plan, revision } = msg;
  if (!plan) return;
  updatePlanCache(sessionId, plan);
  broadcast(msg.type, { sessionId, plan, revision });
}

export function handlePlanCompletedOrCancelled(msg: any, handle: SubprocessHandle): void {
  const { sessionId = handle.chatSessionId, planId } = msg;

  // Update cache status or remove.
  if (msg.type === 'planning:cancelled') {
    updatePlanCache(sessionId, null);
  } else {
    const cachedPlan = getCachedPlan(sessionId);
    if (cachedPlan && cachedPlan.id === planId) {
      cachedPlan.status = 'completed';
      updatePlanCache(sessionId, cachedPlan);
    }
  }

  if (planId) broadcast(msg.type, { sessionId, planId });
}

export function handlePlanError(msg: any, handle: SubprocessHandle): void {
  const { sessionId = handle.chatSessionId, planId, error, phaseId } = msg;

  const cachedPlan = getCachedPlan(sessionId);
  if (cachedPlan && cachedPlan.id === planId) {
    cachedPlan.status = 'error';
    updatePlanCache(sessionId, cachedPlan);
  }

  broadcast(msg.type, { sessionId, planId, error, phaseId });
}

export function handlePlanApprovalRequired(msg: any, handle: SubprocessHandle): void {
  const { sessionId = handle.chatSessionId, planId, phase } = msg;
  broadcast(msg.type, { sessionId, planId, phase });
}
