// Intelligent collaboration engagement (RequestDecision/Preference/Approval/
// Guidance/Feedback): forwards the subprocess's request to the renderer via
// the `askCollaboration` callback registered on the handle at spawn time.
import { createLogger } from '../../../../logger';
import { send, type SubprocessHandle } from '../subprocess-handle';
import type { MsgCollaborationRequest } from '../protocol';
import type { EngagementRequest } from '../../../../../shared/collaboration-types';

const log = createLogger('pi');

export function handleCollaborationRequest(msg: MsgCollaborationRequest, handle: SubprocessHandle): void {
  if (!handle.askCollaboration) {
    log.warn('Collaboration request received but no askCollaboration callback');
    // Return a default "no" response
    send(handle, {
      type: 'collaboration_response',
      requestId: msg.requestId,
      response: {
        type: msg.engagementType,
        decision: 'denied',
        custom_response: 'Collaboration not available',
      },
    });
    return;
  }

  const engagementRequest: EngagementRequest = {
    reqId: msg.requestId,
    turnId: msg.turnId,
    sessionId: msg.sessionId,
    type: msg.engagementType,
    payload: msg.payload as any, // Payload is validated by collaboration handlers
  };

  // Call the renderer callback. Held open until the user responds, which
  // may take arbitrarily long — count it so the idle watchdog (which
  // otherwise reaps subprocesses silent for TURN_IDLE_TIMEOUT_MS) knows
  // this silence is expected, not a hang.
  handle.pendingCollaborationRequests++;
  handle.askCollaboration(engagementRequest)
    .then((response: any) => {
      send(handle, {
        type: 'collaboration_response',
        requestId: msg.requestId,
        response,
      });
    })
    .catch((err: any) => {
      log.error('Collaboration request failed:', err);
      send(handle, {
        type: 'collaboration_response',
        requestId: msg.requestId,
        response: {
          type: msg.engagementType,
          decision: 'denied',
          custom_response: 'Error: ' + String(err),
        },
      });
    })
    .finally(() => {
      handle.pendingCollaborationRequests--;
    });
}
