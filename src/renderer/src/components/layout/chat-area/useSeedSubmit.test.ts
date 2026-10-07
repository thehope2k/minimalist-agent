import { describe, expect, it } from 'vitest';
import { resolveSeedPermissionMode } from './useSeedSubmit';

describe('resolveSeedPermissionMode', () => {
  const seed = {
    displayText: 'Create a skill',
    agentText: 'Create SKILL.md',
    intentTag: 'add-skill',
  };

  it('promotes a seeded creation session to its requested auto mode', () => {
    expect(resolveSeedPermissionMode({ ...seed, permissionMode: 'auto' }, 'plan')).toBe('auto');
  });

  it('retains the fresh session mode when the seed does not request one', () => {
    expect(resolveSeedPermissionMode(seed, 'plan')).toBe('plan');
  });
});
