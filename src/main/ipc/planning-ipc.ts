import { BrowserWindow, ipcMain } from 'electron';
import { sessionPath } from '../storage/sessions';
import { sendPlanApprovalResponse } from '../agent/backends/pi/agent';
import { getActivePlan, updatePlanCache as updatePlan } from '../agent/plan-cache';
import type { Phase } from '../../shared/planning-types';
import { createLogger } from '../logger';

const log = createLogger('ipc:planning');

/**
 * Planning workflow IPC handlers - manages multi-phase execution plans.
 * Plan state is managed by the pi-server subprocess via PlanManager.
 * Events from subprocess update the cache, which is queried here.
 */
export function registerPlanningIpc(): void {
  ipcMain.handle('planning:getActivePlan', async (_e, sessionId: string) => {
    return getActivePlan(sessionId);
  });

  ipcMain.handle('planning:cancelPlan', async (_e, sessionId: string) => {
    const plan = getActivePlan(sessionId);
    if (plan) {
      plan.status = 'cancelled';
      updatePlan(sessionId, plan);
      // Notify renderer
      BrowserWindow.getAllWindows()[0]?.webContents.send('planning:cancelled', {
        sessionId,
        planId: plan.id,
      });
    }
    updatePlan(sessionId, null);
  });

  ipcMain.handle('planning:approvePhase', async (_e, sessionId: string, phaseId: string, notes?: string) => {
    // Send approval response to subprocess - let PlanManager handle the logic
    const sent = sendPlanApprovalResponse({
      chatSessionPath: sessionPath(sessionId),
      phaseId,
      approved: true,
      notes,
    });

    if (!sent) {
      log.warn(`Could not send approval response: subprocess not found for session ${sessionId}`);
    }

    // Note: Plan cache will be updated when subprocess emits phase-updated event
  });

  ipcMain.handle('planning:denyPhase', async (_e, sessionId: string, phaseId: string, reason?: string) => {
    // Send denial response to subprocess - let PlanManager handle the logic
    const sent = sendPlanApprovalResponse({
      chatSessionPath: sessionPath(sessionId),
      phaseId,
      approved: false,
      notes: reason,
    });

    if (!sent) {
      log.warn(`Could not send denial response: subprocess not found for session ${sessionId}`);
    }

    // Note: Plan cache will be updated when subprocess emits phase-updated event
  });

  ipcMain.handle('planning:retryPhase', async (_e, sessionId: string, phaseId: string) => {
    const plan = getActivePlan(sessionId);
    if (!plan) return;

    // Reset phase to pending
    const phase = plan.phases.find((p: Phase) => p.id === phaseId);
    if (phase && phase.status === 'error') {
      phase.status = 'pending';
      phase.error = undefined;
      phase.startedAt = undefined;
      phase.completedAt = undefined;
      updatePlan(sessionId, plan);
    }
  });

  ipcMain.handle('planning:skipPhase', async (_e, sessionId: string, phaseId: string) => {
    const plan = getActivePlan(sessionId);
    if (!plan) return;

    // Mark phase as skipped
    const phase = plan.phases.find((p: Phase) => p.id === phaseId);
    if (phase && (phase.status === 'error' || phase.status === 'blocked')) {
      phase.status = 'skipped';
      updatePlan(sessionId, plan);
    }
  });
}
