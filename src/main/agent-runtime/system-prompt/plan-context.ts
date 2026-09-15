import type { Plan } from '../../../shared/planning-types';
import { createLogger } from '../../logger';

const log = createLogger('system-prompt');

/**
 * Format active plan context for system prompt injection.
 * Provides LLM with current phase awareness.
 */
export function formatActivePlanContext(plan: Plan): string {
  try {
    const completedCount = plan.phases.filter(
      (p) => p.status === 'complete' || p.status === 'skipped',
    ).length;

    const currentPhase = plan.phases.find((p) => p.status === 'running' || p.status === 'pending');

    if (!currentPhase) {
      // All phases complete or error
      return `<active_plan>\nTask: ${plan.task}\nStatus: ${plan.status} (${completedCount}/${plan.phases.length} phases complete)\n</active_plan>`;
    }

    // Build phase progress list
    const progressList = plan.phases
      .map((p, idx) => {
        let icon = '○'; // pending
        if (p.status === 'complete') icon = '✓';
        else if (p.status === 'skipped') icon = '⊘';
        else if (p.status === 'error') icon = '✗';
        else if (p.status === 'running') icon = '→';
        else if (p === currentPhase) icon = '→'; // pending but current

        const label = `${icon} Phase ${idx}: ${p.name}`;
        const statusStr = p.status === 'complete' ? '' : ` (${p.status})`;
        const isCurrent = p === currentPhase ? ' - YOU ARE HERE' : '';

        return `  ${label}${statusStr}${isCurrent}`;
      })
      .join('\n');

    // Risk description
    const riskLevel =
      currentPhase.risk < 30
        ? 'Low risk - minimal changes'
        : currentPhase.risk < 60
          ? 'Medium risk - file modifications'
          : 'High risk - significant changes';

    // Approval status note
    let statusNote: string = currentPhase.status;
    if (currentPhase.approvalStatus === 'awaiting') {
      statusNote = 'pending (awaiting user approval)';
    } else if (currentPhase.approvalStatus === 'approved') {
      statusNote = 'approved - ready to execute';
      if (currentPhase.approvalNotes) {
        statusNote += ` (Note: ${currentPhase.approvalNotes})`;
      }
    } else if (currentPhase.approvalStatus === 'denied') {
      statusNote = 'denied by user';
    } else if (!currentPhase.isSafe && currentPhase.risk >= 60) {
      // High-risk phase that hasn't been approved yet - may need approval
      statusNote = 'pending (may require user approval before execution)';
    }

    // Format actions list
    const actions =
      currentPhase.actions.length <= 3
        ? currentPhase.actions.map((a) => `    • ${a}`).join('\n')
        : `    • ${currentPhase.actions.slice(0, 2).join('\n    • ')}\n    • ... and ${currentPhase.actions.length - 2} more`;

    return `<active_plan>
Task: ${plan.task}
Status: Active (Phase ${currentPhase.index + 1} of ${plan.phases.length})${plan.version > 1 ? ` | Version: ${plan.version}` : ''}

Current Phase: ${currentPhase.index} - ${currentPhase.name}
  Status: ${statusNote}
  Risk: ${currentPhase.risk}/100 (${riskLevel})
  Actions:
${actions}

Progress:
${progressList}
</active_plan>`;
  } catch (error) {
    log.error('Error formatting plan context:', error);
    return `<active_plan>\nTask: ${plan.task}\nStatus: ${plan.status}\n[Error displaying full context]\n</active_plan>`;
  }
}
