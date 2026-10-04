import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PlanManager } from './manager';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

describe('PlanManager approval after restart', () => {
  it('persists approval for a plan only present on disk', () => {
    const dir = mkdtempSync(join(tmpdir(), 'plan-'));
    dirs.push(dir);
    const first = new PlanManager(dir);
    const plan = first.createPlan('s1', {
      task: 't',
      reasoning: 'r',
      phases: [{ name: 'p', description: 'd', actions: ['a'], estimated_risk: 90, is_safe: false }],
    } as never);
    first.checkAndRequestApproval('s1', plan.phases[0].id, 80, 'plan');

    // Fresh manager = new subprocess with an empty in-memory map.
    const second = new PlanManager(dir);
    second.approvePhase('s1', plan.phases[0].id);
    expect(new PlanManager(dir).getActivePlan('s1')?.phases[0].approvalStatus).toBe('approved');
  });
});
