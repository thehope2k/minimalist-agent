import { describe, expect, it } from 'vitest';
import type { LoadedAgent } from '../../../agents/types';
import { buildAgentSystemPrompt } from './prompt';

const agent: LoadedAgent = {
  slug: 'reviewer',
  metadata: {
    name: 'Reviewer',
    description: 'Reviews changes.',
    tools: ['Read', 'Grep'],
    maxTurns: 3,
  },
  content: 'Return concise findings.',
  path: '/agents/reviewer',
  source: 'user',
};

describe('buildAgentSystemPrompt', () => {
  it('includes the declared tool guidance and turn limit', () => {
    expect(buildAgentSystemPrompt(agent)).toContain('You may ONLY use these tools: Read, Grep');
    expect(buildAgentSystemPrompt(agent)).toContain('maximum of 3 turns');
  });
});
