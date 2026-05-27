/**
 * Plan persistence to session storage.
 * 
 * Saves and loads plans from the session directory so they survive app restarts.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { Plan, PlanSchema } from '../../../shared/planning-types';

/**
 * Handles plan persistence.
 */
export class PlanStorage {
  private sessionsDir: string;

  constructor(sessionsDir: string) {
    this.sessionsDir = sessionsDir;
  }

  /**
   * Get plan file path for a session.
   */
  private getPlanPath(sessionId: string): string {
    const sessionDir = join(this.sessionsDir, sessionId);
    
    // Ensure session directory exists
    if (!existsSync(sessionDir)) {
      mkdirSync(sessionDir, { recursive: true });
    }

    return join(sessionDir, 'plan.json');
  }

  /**
   * Save plan to disk.
   */
  savePlan(sessionId: string, plan: Plan): void {
    try {
      const planPath = this.getPlanPath(sessionId);
      const json = JSON.stringify(plan, null, 2);
      writeFileSync(planPath, json, 'utf-8');
    } catch (error) {
      console.error(`Failed to save plan for session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Load plan from disk.
   */
  loadPlan(sessionId: string): Plan | null {
    try {
      const planPath = this.getPlanPath(sessionId);
      
      if (!existsSync(planPath)) {
        return null;
      }

      const json = readFileSync(planPath, 'utf-8');
      const data = JSON.parse(json);

      // Validate with Zod
      const plan = PlanSchema.parse(data);
      
      return plan;
    } catch (error) {
      console.error(`Failed to load plan for session ${sessionId}:`, error);
      return null;
    }
  }

  /**
   * Check if a plan exists for a session.
   */
  hasPlan(sessionId: string): boolean {
    const planPath = this.getPlanPath(sessionId);
    return existsSync(planPath);
  }

  /**
   * Delete plan for a session.
   */
}
