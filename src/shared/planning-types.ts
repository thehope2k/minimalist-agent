/**
 * Planning workflow types for multi-phase task execution.
 * 
 * Enables agents to break complex tasks into sequential phases,
 * track progress, and adapt plans based on discoveries.
 */

import { z } from 'zod';

/**
 * Plan execution status.
 */
export type PlanStatus = 'active' | 'completed' | 'cancelled' | 'error';

/**
 * Phase execution status.
 */
export type PhaseStatus = 'pending' | 'running' | 'complete' | 'blocked' | 'error' | 'skipped';

/**
 * A single phase in a multi-phase plan.
 */
export interface Phase {
  id: string;
  index: number;
  name: string;
  description: string;
  actions: string[];
  isSafe: boolean;
  risk: number; // 0-100
  status: PhaseStatus;
  startedAt?: number;
  completedAt?: number;
  findings?: string;
  error?: string;
}

/**
 * A revision to a plan.
 */
export interface PlanRevision {
  version: number;
  timestamp: number;
  reason: string;
  changedPhases: number[]; // Indices of phases that changed
  changeSummary: string;
}

/**
 * A complete execution plan.
 */
export interface Plan {
  id: string;
  version: number;
  task: string;
  phases: Phase[];
  status: PlanStatus;
  createdAt: number;
  lastUpdatedAt: number;
  revisions: PlanRevision[];
}

/**
 * Input for CreatePlan tool.
 */
export interface CreatePlanInput {
  task: string;
  phases: {
    name: string;
    description: string;
    actions: string[];
    estimated_risk: number;
    is_safe: boolean;
    risk_reason?: string; // Optional: explain risk if >= 70
  }[];
  reasoning: string;
}

/**
 * Output from CreatePlan tool.
 */
export interface CreatePlanOutput {
  plan_id: string;
  version: number;
  phases_count: number;
  message: string;
}

/**
 * Input for ReportPhaseProgress tool.
 */
export interface ReportPhaseProgressInput {
  phase_index: number;
  status: 'running' | 'complete' | 'blocked';
  findings: string;
  suggests_revision: boolean;
}

/**
 * Output from ReportPhaseProgress tool.
 */
export interface ReportPhaseProgressOutput {
  phase_index: number;
  status: PhaseStatus;
  revision_needed: boolean;
  message: string;
}

/**
 * Input for RevisePlan tool.
 */
export interface RevisePlanInput {
  reason: string;
  revised_phases: {
    name: string;
    description: string;
    actions: string[];
    estimated_risk: number;
    is_safe: boolean;
    risk_reason?: string; // Optional: explain risk if >= 70
  }[];
  changes_summary: string;
}

/**
 * Output from RevisePlan tool.
 */
export interface RevisePlanOutput {
  plan_id: string;
  old_version: number;
  new_version: number;
  changed_phases: number[];
  message: string;
}

/**
 * Safety analysis for a phase.
 */
export interface SafetyAnalysis {
  isSafe: boolean;
  risk: number;
  riskFactors: string[];
  confidence: number; // 0-100
}

/**
 * Discrepancy detected during plan execution.
 */
export interface Discrepancy {
  type: 'approach_change' | 'unexpected_finding' | 'missing_dependency' | 'assumption_violated';
  description: string;
  affectedPhases: number[];
  severity: 'low' | 'medium' | 'high';
}

// ============================================================================
// ZOD VALIDATION SCHEMAS
// ============================================================================

/**
 * Zod schema for Phase.
 */
export const PhaseSchema = z.object({
  id: z.string(),
  index: z.number().int().min(0),
  name: z.string().min(1, 'Phase name cannot be empty'),
  description: z.string().min(1, 'Phase description cannot be empty'),
  actions: z.array(z.string()).min(1, 'Phase must have at least one action'),
  isSafe: z.boolean(),
  risk: z.number().int().min(0).max(100),
  status: z.enum(['pending', 'running', 'complete', 'blocked', 'error', 'skipped']),
  startedAt: z.number().optional(),
  completedAt: z.number().optional(),
  findings: z.string().optional(),
  error: z.string().optional(),
});

/**
 * Zod schema for PlanRevision.
 */
export const PlanRevisionSchema = z.object({
  version: z.number().int().min(1),
  timestamp: z.number(),
  reason: z.string().min(1),
  changedPhases: z.array(z.number().int().min(0)),
  changeSummary: z.string().min(1),
});

/**
 * Zod schema for Plan.
 */
export const PlanSchema = z.object({
  id: z.string(),
  version: z.number().int().min(1),
  task: z.string().min(1, 'Task cannot be empty'),
  phases: z.array(PhaseSchema).min(1, 'Plan must have at least one phase'),
  status: z.enum(['active', 'completed', 'cancelled', 'error']),
  createdAt: z.number(),
  lastUpdatedAt: z.number(),
  revisions: z.array(PlanRevisionSchema),
});

/**
 * Zod schema for CreatePlanInput.
 */
export const CreatePlanInputSchema = z.object({
  task: z.string().min(1, 'Task cannot be empty'),
  phases: z.array(
    z.object({
      name: z.string().min(1, 'Phase name cannot be empty'),
      description: z.string().min(1, 'Phase description cannot be empty'),
      actions: z.array(z.string()).min(1, 'Phase must have at least one action'),
      estimated_risk: z.number().int().min(0).max(100),
      is_safe: z.boolean(),
      risk_reason: z.string().optional(),
    })
  ).min(1, 'Plan must have at least one phase').max(20, 'Too many phases (max 20)'),
  reasoning: z.string().min(1, 'Reasoning cannot be empty'),
});

/**
 * Zod schema for ReportPhaseProgressInput.
 */
export const ReportPhaseProgressInputSchema = z.object({
  phase_index: z.number().int().min(0),
  status: z.enum(['running', 'complete', 'blocked']),
  findings: z.string(),
  suggests_revision: z.boolean(),
});

/**
 * Zod schema for RevisePlanInput.
 */
export const RevisePlanInputSchema = z.object({
  reason: z.string().min(1, 'Reason cannot be empty'),
  revised_phases: z.array(
    z.object({
      name: z.string().min(1, 'Phase name cannot be empty'),
      description: z.string().min(1, 'Phase description cannot be empty'),
      actions: z.array(z.string()).min(1, 'Phase must have at least one action'),
      estimated_risk: z.number().int().min(0).max(100),
      is_safe: z.boolean(),
      risk_reason: z.string().optional(),
    })
  ).min(1, 'Revised plan must have at least one phase').max(20, 'Too many phases (max 20)'),
  changes_summary: z.string().min(1, 'Changes summary cannot be empty'),
});

/**
 * Validate CreatePlanInput.
 */
export function validateCreatePlanInput(input: unknown): CreatePlanInput {
  return CreatePlanInputSchema.parse(input);
}

/**
 * Validate ReportPhaseProgressInput.
 */
export function validateReportPhaseProgressInput(input: unknown): ReportPhaseProgressInput {
  return ReportPhaseProgressInputSchema.parse(input);
}

/**
 * Validate RevisePlanInput.
 */
export function validateRevisePlanInput(input: unknown): RevisePlanInput {
  return RevisePlanInputSchema.parse(input);
}
