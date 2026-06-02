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
  'phase-approval-required': (planId: string, phase: Phase) => void;
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
   * Check if a phase requires approval and mark it as awaiting if needed.
   * Returns true if approval is required and event was emitted.
   */
  checkAndRequestApproval(
    sessionId: string,
    phaseId: string,
    autonomyLevel: number,
    permissionMode: string
  ): boolean {
    const plan = this.activePlans.get(sessionId);
    if (!plan) return false;

    const phase = plan.phases.find((p) => p.id === phaseId);
    if (!phase) return false;

    // Skip if already approved or denied
    if (phase.approvalStatus === 'approved' || phase.approvalStatus === 'denied') {
      return false;
    }

    // Check if approval is required
    if (this.shouldPhaseRequireApproval(phase, autonomyLevel, permissionMode)) {
      // Mark as awaiting approval
      phase.approvalStatus = 'awaiting';
      plan.lastUpdatedAt = Date.now();
      this.storage.savePlan(sessionId, plan);
      
      // Emit event to trigger approval dialog
      this.emit('phase-approval-required', plan.id, phase);
      
      console.log(`[PlanManager] Phase ${phase.index} (${phase.name}) requires approval - event emitted`);
      return true;
    }

    return false;
  }

  /**
   * Check if a phase can execute based on mode and autonomy.
   */
  /**
   * Record phase error and mark plan as failed.
   * Convenience method that:
   * 1. Sets plan.status = 'error'
   * 2. Sets phase.status = 'error' with error message
   * 3. Emits 'plan-error' event
   * 
   * Use when:
   * - Tool execution fails during a phase
   * - Phase operation throws an exception
   * - ReportPhaseProgress encounters an error
   * - Any unrecoverable phase-specific error occurs
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
   * Check if a phase requires user approval before execution.
   */
  shouldPhaseRequireApproval(
    phase: Phase,
    autonomyLevel: number,
    permissionMode: string
  ): boolean {
    // Safe phases (read-only, risk < 20) never need approval
    if (phase.isSafe || phase.risk < 20) return false;
    
    // Auto permission mode bypasses approval
    if (permissionMode === 'auto') return false;
    
    // Approval based on risk and autonomy
    // Lower autonomy = more approvals
    // Higher risk = more likely to need approval
    const threshold = 100 - autonomyLevel; // autonomy 50 → threshold 50
    return phase.risk >= threshold;
  }

  /**
   * Approve a phase for execution.
   */
  approvePhase(sessionId: string, phaseId: string, notes?: string): void {
    const plan = this.activePlans.get(sessionId);
    if (!plan) {
      console.warn(`[PlanManager] Cannot approve phase: No active plan for session ${sessionId}`);
      throw new Error(`No active plan for session ${sessionId}`);
    }

    const phase = plan.phases.find((p) => p.id === phaseId);
    if (!phase) {
      console.warn(`[PlanManager] Cannot approve phase: Phase ${phaseId} not found in plan ${plan.id}`);
      throw new Error(`Phase ${phaseId} not found in plan ${plan.id}`);
    }
    
    // Check for status conflicts
    if (phase.status === 'complete' || phase.status === 'skipped') {
      console.warn(`[PlanManager] Phase ${phaseId} already ${phase.status}, ignoring approval`);
      return; // Already done, ignore approval
    }

    phase.approvalStatus = 'approved';
    if (notes) {
      phase.approvalNotes = notes;
    }

    plan.lastUpdatedAt = Date.now();
    this.storage.savePlan(sessionId, plan);
    this.emit('phase-updated', plan.id, phase);
    this.emit('plan-updated', plan);
    
    console.log(`[PlanManager] Phase ${phase.index} (${phase.name}) approved for session ${sessionId}`);
  }

  /**
   * Deny a phase and mark it as skipped.
   */
  denyPhase(sessionId: string, phaseId: string, reason?: string): void {
    const plan = this.activePlans.get(sessionId);
    if (!plan) {
      console.warn(`[PlanManager] Cannot deny phase: No active plan for session ${sessionId}`);
      throw new Error(`No active plan for session ${sessionId}`);
    }

    const phase = plan.phases.find((p) => p.id === phaseId);
    if (!phase) {
      console.warn(`[PlanManager] Cannot deny phase: Phase ${phaseId} not found in plan ${plan.id}`);
      throw new Error(`Phase ${phaseId} not found in plan ${plan.id}`);
    }
    
    // Check for status conflicts
    if (phase.status === 'complete') {
      console.warn(`[PlanManager] Phase ${phaseId} already complete, cannot deny`);
      return; // Already complete, don't mark as skipped
    }
    
    if (phase.status === 'skipped') {
      console.log(`[PlanManager] Phase ${phaseId} already skipped, updating reason`);
      // Update reason if already skipped
    }

    phase.approvalStatus = 'denied';
    phase.status = 'skipped';
    phase.completedAt = Date.now();
    if (reason) {
      phase.approvalNotes = reason;
      phase.findings = `Skipped by user: ${reason}`;
    } else {
      phase.findings = 'Skipped by user';
    }

    plan.lastUpdatedAt = Date.now();
    this.storage.savePlan(sessionId, plan);
    this.emit('phase-updated', plan.id, phase);
    this.emit('plan-updated', plan);
    
    console.log(`[PlanManager] Phase ${phase.index} (${phase.name}) denied and skipped for session ${sessionId}`);
  }

  /**
   * Get the next pending phase that's ready to execute.
   * Returns null if no phase is ready or all phases are complete.
   */
  getNextPendingPhase(sessionId: string): Phase | null {
    const plan = this.activePlans.get(sessionId);
    if (!plan) return null;
    
    // Find first phase that's pending and all previous are complete/skipped
    return plan.phases.find((p, idx) => {
      if (p.status !== 'pending') return false;
      
      // Check all previous phases
      for (let i = 0; i < idx; i++) {
        const prev = plan.phases[i];
        if (prev.status !== 'complete' && prev.status !== 'skipped') {
          return false; // Previous phase not done yet
        }
      }
      
      return true;
    }) || null;
  }

  /**
   * Validate phase progression and provide helpful warnings.
   * Returns validation result with optional warning and suggestion.
   */
  validatePhaseProgression(sessionId: string, phaseIndex: number): {
    valid: boolean;
    warning?: string;
    suggestion?: string;
    expectedPhase?: number;
  } {
    const plan = this.activePlans.get(sessionId);
    if (!plan) return { valid: true };
    
    const phase = plan.phases[phaseIndex];
    if (!phase) {
      return {
        valid: false,
        warning: `Phase ${phaseIndex} not found in plan`,
      };
    }
    
    // Check if there are incomplete previous phases
    const incompletePrevious: number[] = [];
    for (let i = 0; i < phaseIndex; i++) {
      const prev = plan.phases[i];
      if (prev.status === 'pending' || prev.status === 'blocked') {
        incompletePrevious.push(i);
      }
    }
    
    if (incompletePrevious.length > 0) {
      const expectedPhase = incompletePrevious[0];
      const expectedPhaseName = plan.phases[expectedPhase].name;
      
      return {
        valid: true, // Not an error, just a warning
        warning: `Working on Phase ${phaseIndex} but Phase ${expectedPhase} (${expectedPhaseName}) is still pending`,
        suggestion: `Consider completing Phase ${expectedPhase} first, or use ReportPhaseProgress(${expectedPhase}, 'skipped', ...) if intentionally skipping it.`,
        expectedPhase,
      };
    }
    
    return { valid: true };
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
