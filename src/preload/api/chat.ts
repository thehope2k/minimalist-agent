import { ipcRenderer } from 'electron';
import type {
  AppApi,
  ChatSendRequest,
  ChatStreamEvent,
  EngagementRequest,
  EngagementResponse,
  Phase,
  Plan,
  PlanRevision,
  StoredAttachment,
} from '../../shared/electron-api';

export function createChatApi(): Pick<AppApi, 'chat' | 'planning'> {
  return {
    chat: {
      send: (req: ChatSendRequest): Promise<void> => ipcRenderer.invoke('chat:send', req),
      abort: (id: string): Promise<void> => ipcRenderer.invoke('chat:abort', id),
      steer: (
        turnId: string,
        message: string,
        attachments?: StoredAttachment[],
      ): Promise<{ ok: boolean; reason?: string }> =>
        ipcRenderer.invoke('chat:steer', { turnId, message, attachments }),
      manualCompact: (args: {
        turnId: string;
        sessionId: string;
        connectionSlug: string;
        customInstructions?: string;
      }): Promise<void> => ipcRenderer.invoke('chat:manualCompact', args),
      generateTitle: (args: {
        connectionSlug: string;
        messages: Array<{ role: 'user' | 'assistant'; content: string }>;
        model?: string;
        sessionId?: string;
        cwd?: string;
      }): Promise<string | null> => ipcRenderer.invoke('chat:generateTitle', args),
      onEvent: (cb: (e: ChatStreamEvent) => void): (() => void) => {
        const handler = (_e: unknown, payload: ChatStreamEvent) => cb(payload);
        ipcRenderer.on('chat:event', handler);
        return () => ipcRenderer.removeListener('chat:event', handler);
      },
      onCollaborationRequest: (cb: (req: EngagementRequest) => void): (() => void) => {
        const handler = (_e: unknown, payload: EngagementRequest) => cb(payload);
        ipcRenderer.on('chat:collaboration-request', handler);
        return () => ipcRenderer.removeListener('chat:collaboration-request', handler);
      },
      respondCollaboration: (response: EngagementResponse): Promise<void> =>
        ipcRenderer.invoke('chat:collaboration-response', response),
    },
    planning: {
      getActivePlan: (sessionId: string): Promise<Plan | null> =>
        ipcRenderer.invoke('planning:getActivePlan', sessionId),
      cancelPlan: (sessionId: string): Promise<void> =>
        ipcRenderer.invoke('planning:cancelPlan', sessionId),
      approvePhase: (sessionId: string, phaseId: string, notes?: string): Promise<void> =>
        ipcRenderer.invoke('planning:approvePhase', sessionId, phaseId, notes),
      denyPhase: (sessionId: string, phaseId: string, reason?: string): Promise<void> =>
        ipcRenderer.invoke('planning:denyPhase', sessionId, phaseId, reason),
      retryPhase: (sessionId: string, phaseId: string): Promise<void> =>
        ipcRenderer.invoke('planning:retryPhase', sessionId, phaseId),
      skipPhase: (sessionId: string, phaseId: string): Promise<void> =>
        ipcRenderer.invoke('planning:skipPhase', sessionId, phaseId),
      onPlanCreated: (cb: (sessionId: string, plan: Plan) => void): (() => void) => {
        const handler = (_e: unknown, payload: { sessionId: string; plan: Plan }) =>
          cb(payload.sessionId, payload.plan);
        ipcRenderer.on('planning:created', handler);
        return () => ipcRenderer.removeListener('planning:created', handler);
      },
      onPlanUpdated: (cb: (sessionId: string, plan: Plan) => void): (() => void) => {
        const handler = (_e: unknown, payload: { sessionId: string; plan: Plan }) =>
          cb(payload.sessionId, payload.plan);
        ipcRenderer.on('planning:updated', handler);
        return () => ipcRenderer.removeListener('planning:updated', handler);
      },
      onPhaseUpdated: (
        cb: (sessionId: string, planId: string, phase: Phase) => void,
      ): (() => void) => {
        const handler = (
          _e: unknown,
          payload: { sessionId: string; planId: string; phase: Phase },
        ) => cb(payload.sessionId, payload.planId, payload.phase);
        ipcRenderer.on('planning:phase-updated', handler);
        return () => ipcRenderer.removeListener('planning:phase-updated', handler);
      },
      onPlanRevised: (
        cb: (sessionId: string, plan: Plan, revision: PlanRevision) => void,
      ): (() => void) => {
        const handler = (
          _e: unknown,
          payload: { sessionId: string; plan: Plan; revision: PlanRevision },
        ) => cb(payload.sessionId, payload.plan, payload.revision);
        ipcRenderer.on('planning:revised', handler);
        return () => ipcRenderer.removeListener('planning:revised', handler);
      },
      onPlanCompleted: (cb: (sessionId: string, planId: string) => void): (() => void) => {
        const handler = (_e: unknown, payload: { sessionId: string; planId: string }) =>
          cb(payload.sessionId, payload.planId);
        ipcRenderer.on('planning:completed', handler);
        return () => ipcRenderer.removeListener('planning:completed', handler);
      },
      onPlanCancelled: (cb: (sessionId: string, planId: string) => void): (() => void) => {
        const handler = (_e: unknown, payload: { sessionId: string; planId: string }) =>
          cb(payload.sessionId, payload.planId);
        ipcRenderer.on('planning:cancelled', handler);
        return () => ipcRenderer.removeListener('planning:cancelled', handler);
      },
      onPlanError: (
        cb: (sessionId: string, planId: string, error: string, phaseId?: string) => void,
      ): (() => void) => {
        const handler = (
          _e: unknown,
          payload: { sessionId: string; planId: string; error: string; phaseId?: string },
        ) => cb(payload.sessionId, payload.planId, payload.error, payload.phaseId);
        ipcRenderer.on('planning:error', handler);
        return () => ipcRenderer.removeListener('planning:error', handler);
      },
      onApprovalRequired: (
        cb: (sessionId: string, planId: string, phase: Phase) => void,
      ): (() => void) => {
        const handler = (
          _e: unknown,
          payload: { sessionId: string; planId: string; phase: Phase },
        ) => cb(payload.sessionId, payload.planId, payload.phase);
        ipcRenderer.on('planning:approval-required', handler);
        return () => ipcRenderer.removeListener('planning:approval-required', handler);
      },
      onPermissionModeChanged: (
        cb: (sessionId: string, mode: 'plan' | 'auto') => void,
      ): (() => void) => {
        const handler = (_e: unknown, payload: { sessionId: string; mode: 'plan' | 'auto' }) =>
          cb(payload.sessionId, payload.mode);
        ipcRenderer.on('permission-mode-changed', handler);
        return () => ipcRenderer.removeListener('permission-mode-changed', handler);
      },
    },
  };
}
