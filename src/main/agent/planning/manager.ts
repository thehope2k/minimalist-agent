/**
 * Plan lifecycle management.
 * 
 * Handles plan creation, phase execution tracking, revision, and persistence.
 */

import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import {
  Plan,
  Phase,
  PhaseStatus,
  PlanRevision,
  CreatePlanInput,
  RevisePlanInput,
} from '../../../shared/planning-types';
import { RevisionDetector } from './revision-detector';
import { PlanStorage } from './storage';

import { throttle } from './perf-utils';

/**
 * Events emitted by PlanManager.
 */
export interface PlanManagerEvents {
  'plan-created': (plan: Plan) => void;
  'plan-updated': (plan: Plan) => void;
  'phase-updated': (planId: string, phase: Phase) => void;
  'plan-revised': (plan: Plan, revision: PlanRevision) => void;
  'plan-completed': (planId: string) => void;
  'plan-cancelled': (planId: string) => void;
  'plan-error': (planId: string, error: string, phaseId?: string) => void;
}

export declare interface PlanManager {
  on<E extends keyof PlanManagerEvents>(event: E, listener: PlanManagerEvents[E]): this;
  emit<E extends keyof PlanManagerEvents>(event: E, ...args: Parameters<PlanManagerEvents[E]>): boolean;
}

/**
 * Manages plan lifecycle and execution.
 */
export class PlanManager extends EventEmitter {
  private activePlans: Map<string, Plan> = new Map(); // sessionId -> Plan
  private revisionDetector: RevisionDetector;
  private storage: PlanStorage;

  constructor(sessionsDir: string) {
    super();
    this.revisionDetector = new RevisionDetector();
    this.storage = new PlanStorage(sessionsDir);
    
    // Throttle storage saves to avoid excessive disk I/O during rapid updates
    this.throttledSave = throttle(
      (sessionId: string, plan: Plan) => this.storage.savePlan(sessionId, plan),
      500 // Save at most once per 500ms
    );
  }

  private throttledSave: (sessionId: string, plan: Plan) => void;

  /**
   * Create a new plan for a session.
   */
  createPlan(sessionId: string, input: CreatePlanInput): Plan {
    // Cancel any existing plan for this session
    const existing = this.activePlans.get(sessionId);
    if (existing && existing.status === 'active') {
      this.cancelPlan(sessionId);
    }

    // Create phases with IDs, using LLM's risk assessment
    const phases: Phase[] = input.phases.map((p, index) => {
      const phaseId = randomUUID();

      // Validate risk score is reasonable
      if (p.estimated_risk < 0 || p.estimated_risk > 100) {
        console.warn(
          `Phase "${p.name}" has invalid risk score ${p.estimated_risk}. Clamping to 0-100.`
        );
        p.estimated_risk = Math.max(0, Math.min(100, p.estimated_risk));
      }

      // Validate is_safe matches risk (safe should be < 20)
      if (p.is_safe && p.estimated_risk >= 20) {
        console.warn(
          `Phase "${p.name}" marked as safe but has risk ${p.estimated_risk} >= 20. ` +
          `Treating as non-safe.`
        );
        p.is_safe = false;
      }

      return {
        id: phaseId,
        index,
        name: p.name,
        description: p.description,
        actions: p.actions,
        isSafe: p.is_safe,           // Trust LLM's classification
        risk: p.estimated_risk,      // Trust LLM's risk score
        status: 'pending',
      };
    });

    // Create plan
    const plan: Plan = {
      id: randomUUID(),
      version: 1,
      task: input.task,
      phases,
      status: 'active',
      createdAt: Date.now(),
      lastUpdatedAt: Date.now(),
      revisions: [],
    };

    // Store and emit
    this.activePlans.set(sessionId, plan);
    this.storage.savePlan(sessionId, plan);
    this.emit('plan-created', plan);

    return plan;
  }

  /**
   * Get active plan for a session.
   */
  getActivePlan(sessionId: string): Plan | null {
    return this.activePlans.get(sessionId) || null;
  }

  /**
   * Update phase status.
   */
  updatePhaseStatus(
    sessionId: string,
    phaseId: string,
    status: PhaseStatus,
    findings?: string,
    error?: string
  ): void {
    const plan = this.activePlans.get(sessionId);
    if (!plan) {
      throw new Error(`No active plan for session ${sessionId}`);
    }

    const phase = plan.phases.find((p) => p.id === phaseId);
    if (!phase) {
      throw new Error(`Phase ${phaseId} not found in plan ${plan.id}`);
    }

    phase.status = status;
    if (findings) phase.findings = findings;
    if (error) phase.error = error;

    if (status === 'running' && !phase.startedAt) {
      phase.startedAt = Date.now();
    }

    if (status === 'complete' || status === 'error' || status === 'skipped') {
      phase.completedAt = Date.now();
    }

    plan.lastUpdatedAt = Date.now();

    // Save and emit
    this.storage.savePlan(sessionId, plan);
    this.emit('phase-updated', plan.id, phase);
    this.emit('plan-updated', plan);

    // Check if plan is complete
    if (this.isAllPhasesComplete(plan)) {
      plan.status = 'completed';
      this.emit('plan-completed', plan.id);
      this.storage.savePlan(sessionId, plan);
    }
  }

  /**
   * Check if a phase can execute based on mode and autonomy.
   */
  /**
   * Record phase error.
   */
  recordPhaseError(sessionId: string, phaseId: string, error: string): void {
    const plan = this.activePlans.get(sessionId);
    if (plan) {
      plan.status = 'error';
      this.emit('plan-error', plan.id, error);
    }
    this.updatePhaseStatus(sessionId, phaseId, 'error', undefined, error);
  }

  /**
   * Revise a plan.
   */
  revisePlan(sessionId: string, input: RevisePlanInput): Plan {
    const plan = this.activePlans.get(sessionId);
    if (!plan) {
      throw new Error(`No active plan for session ${sessionId}`);
    }

    // Find the index where we should start replacing phases
    const firstPendingIndex = plan.phases.findIndex((p) => p.status === 'pending' || p.status === 'blocked');
    if (firstPendingIndex === -1) {
      throw new Error('Cannot revise plan: no pending phases');
    }

    // Keep completed phases, replace pending ones
    const completedPhases = plan.phases.slice(0, firstPendingIndex);
    
    // Create new phases with LLM's risk assessment
    const newPhases: Phase[] = input.revised_phases.map((p, index) => {
      const phaseId = randomUUID();

      // Validate risk score is reasonable
      if (p.estimated_risk < 0 || p.estimated_risk > 100) {
        console.warn(
          `Revised phase "${p.name}" has invalid risk score ${p.estimated_risk}. Clamping to 0-100.`
        );
        p.estimated_risk = Math.max(0, Math.min(100, p.estimated_risk));
      }

      // Validate is_safe matches risk
      if (p.is_safe && p.estimated_risk >= 20) {
        console.warn(
          `Revised phase "${p.name}" marked as safe but has risk ${p.estimated_risk} >= 20. ` +
          `Treating as non-safe.`
        );
        p.is_safe = false;
      }

      return {
        id: phaseId,
        index: firstPendingIndex + index,
        name: p.name,
        description: p.description,
        actions: p.actions,
        isSafe: p.is_safe,           // Trust LLM's classification
        risk: p.estimated_risk,      // Trust LLM's risk score
        status: 'pending',
      };
    });

    // Identify changed phase indices
    const changedPhases = newPhases.map((p) => p.index);

    // Create revision record
    const revision: PlanRevision = {
      version: plan.version + 1,
      timestamp: Date.now(),
      reason: input.reason,
      changedPhases,
      changeSummary: input.changes_summary,
    };

    // Update plan
    plan.version = revision.version;
    plan.phases = [...completedPhases, ...newPhases];
    plan.lastUpdatedAt = Date.now();
    plan.revisions.push(revision);

    // Save and emit
    this.storage.savePlan(sessionId, plan);
    this.emit('plan-revised', plan, revision);
    this.emit('plan-updated', plan);

    return plan;
  }

  /**
   * Check if revision is suggested based on findings.
   */
  shouldRevise(sessionId: string, phaseId: string, findings: string): boolean {
    const plan = this.activePlans.get(sessionId);
    if (!plan) return false;

    const phase = plan.phases.find((p) => p.id === phaseId);
    if (!phase) return false;

    const remainingPhases = plan.phases.filter((p) => p.status === 'pending');
    
    return this.revisionDetector.shouldRevise(phase, findings, remainingPhases).should;
  }

  /**
   * Pause a plan.
   */
  /**
   * Cancel a plan.
   */
  cancelPlan(sessionId: string): void {
    const plan = this.activePlans.get(sessionId);
    if (plan) {
      plan.status = 'cancelled';
      plan.lastUpdatedAt = Date.now();
      this.storage.savePlan(sessionId, plan);
      this.emit('plan-cancelled', plan.id);
      this.activePlans.delete(sessionId);
    }
  }

  /**
   * Check if all phases are complete.
   */
  private isAllPhasesComplete(plan: Plan): boolean {
    return plan.phases.every(
      (p) => p.status === 'complete' || p.status === 'skipped' || p.status === 'error'
    );
  }


}
