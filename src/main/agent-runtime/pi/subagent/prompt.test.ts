import { describe, expect, it } from 'vitest';
import type { LoadedAgent } from '../../../agents/types';
import { buildAgentSystemPrompt } from './prompt';

const agent: LoadedAgent = {
  slug: 'reviewer',
  metadata: {
    name: 'Reviewer',
    description: 'Reviews changes.',
    tools: ['Read', 'Grep'],
  },
  content: 'Return concise findings.',
  path: '/agents/reviewer',
  source: 'user',
};

describe('buildAgentSystemPrompt', () => {
  it('includes the declared tool guidance', () => {
    expect(buildAgentSystemPrompt(agent)).toContain('You may ONLY use these tools: Read, Grep');
  });
});
