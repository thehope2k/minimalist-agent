// CreatePlan / ReportPhaseProgress / RevisePlan — the planning workflow tool
// set. These tools manage the workflow itself, so they bypass the regular
// permission gate.
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { createCreatePlanTool } from './planning-tools/create-plan';
import { createReportPhaseProgressTool } from './planning-tools/report-progress';
import { createRevisePlanTool } from './planning-tools/revise-plan';

export function createPlanningTools(sessionId: string): ToolDefinition<any, any>[] {
  return [
    createCreatePlanTool(sessionId),
    createReportPhaseProgressTool(sessionId),
    createRevisePlanTool(sessionId),
  ];
}
