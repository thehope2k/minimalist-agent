import { BrowserWindow, ipcMain } from 'electron';
import { dirname } from 'node:path';
import { sessionPath } from '../storage/sessions';
import { sendPlanApprovalResponse } from '../agent-runtime/pi/agent';
import { getActivePlan, restorePlanCache, updatePlanCache as updatePlan } from '../agent-runtime/plan-cache';
import { PlanStorage } from '../agent-runtime/planning/storage';
import type { Phase, Plan } from '../../shared/planning-types';

function applyPersistedPhaseDecision(
  sessionId: string,
  phaseId: string,
  approved: boolean,
  notes?: string,
): void {
  const sessionsDir = dirname(sessionPath(sessionId));
  const plan = (getActivePlan(sessionId) ?? restorePlanCache(sessionId, sessionsDir)) as Plan | null;
  if (!plan) throw new Error(`No plan found for session ${sessionId}`);

  const phase = plan.phases.find((candidate) => candidate.id === phaseId);
  if (!phase) throw new Error(`Phase ${phaseId} not found in plan ${plan.id}`);
  if (phase.approvalStatus !== 'awaiting') {
    throw new Error(`Phase ${phaseId} is not awaiting approval`);
  }

  if (approved) {
    phase.approvalStatus = 'approved';
    if (notes) phase.approvalNotes = notes;
  } else {
    phase.approvalStatus = 'denied';
    phase.status = 'skipped';
    phase.completedAt = Date.now();
    phase.approvalNotes = notes;
    phase.findings = notes ? `Skipped by user: ${notes}` : 'Skipped by user';
  }
  plan.lastUpdatedAt = Date.now();

  new PlanStorage(sessionsDir).savePlan(sessionId, plan);
  updatePlan(sessionId, plan);
  BrowserWindow.getAllWindows()[0]?.webContents.send('planning:phase-updated', {
    sessionId,
    planId: plan.id,
    phase,
  });
  BrowserWindow.getAllWindows()[0]?.webContents.send('planning:updated', { sessionId, plan });
}

/**
 * Planning workflow IPC handlers - manages multi-phase execution plans.
 * Plan state is managed by the pi-server subprocess via PlanManager.
 * Events from subprocess update the cache, which is queried here.
 */
export function registerPlanningIpc(): void {
  ipcMain.handle('planning:getActivePlan', async (_e, sessionId: string) => {
    return getActivePlan(sessionId) ?? restorePlanCache(sessionId, dirname(sessionPath(sessionId)));
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
      applyPersistedPhaseDecision(sessionId, phaseId, true, notes);
    }

    // A live subprocess emits the cache/UI updates; the fallback persists and
    // broadcasts the same updates so a restored approval is not lost.
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
      applyPersistedPhaseDecision(sessionId, phaseId, false, reason);
    }

    // A live subprocess emits the cache/UI updates; the fallback persists and
    // broadcasts the same updates so a restored denial is not lost.
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
