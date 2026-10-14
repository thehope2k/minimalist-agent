import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { getPath: () => '/tmp/ma-test', isPackaged: false } }));

import { getArtifactPolicy, getAssistantPrompt } from './system-prompt/assistant-body';
import { getCollaborationGuidance } from './collaboration-prompt';
import { getPlanningGuidance } from './planning-prompt';

// Rendered characters of the always-on static blocks; real tokens are ≈ 0.38 × chars (see docs/SYSTEM-PROMPT.md).
const STATIC_BLOCKS_BUDGET_CHARS = 14_000;
const AUTONOMY_LOW = 20;
const AUTONOMY_MEDIUM = 50;
const AUTONOMY_HIGH = 90;

const assistantBody = getAssistantPrompt(true, 'GitHub Copilot (test)');
const planning = getPlanningGuidance();

describe('always-on static prompt blocks', () => {
  it('stay within the size budget', () => {
    const total =
      assistantBody.length +
      getArtifactPolicy().length +
      getCollaborationGuidance(AUTONOMY_MEDIUM).length +
      planning.length;
    expect(total).toBeLessThanOrEqual(STATIC_BLOCKS_BUDGET_CHARS);
  });
});

describe('collaboration guidance keeps its behavior-critical rules', () => {
  const guidance = getCollaborationGuidance(AUTONOMY_HIGH);

  it.each([
    'RequestDecision',
    'RequestPreference',
    'RequestApproval',
    'RequestGuidance',
    'RequestFeedback',
    'risk < 90',
    'risk ≥ 90',
    'risk ≥ 85 always confirms',
    'do NOT',
    'Autonomy contract',
  ])('mentions %s', (phrase) => {
    expect(guidance).toContain(phrase);
  });

  it('renders a distinct behavior band per autonomy level', () => {
    expect(getCollaborationGuidance(AUTONOMY_LOW)).toContain('pair programming mode');
    expect(getCollaborationGuidance(AUTONOMY_MEDIUM)).toContain('Use judgment');
    expect(guidance).toContain('Minimize interruptions');
  });
});

describe('planning guidance keeps its behavior-critical rules', () => {
  it.each([
    "status='running'",
    "status='complete'",
    'indices stay absolute',
    'only in **plan** mode',
    'risk >= 85 always confirms',
    'promoted to auto',
    'Denied',
    '5+ steps',
    'risk_reason',
  ])('mentions %s', (phrase) => {
    expect(planning).toContain(phrase);
  });
});

describe('assistant body keeps its behavior-critical rules', () => {
  it.each([
    'Read ALL listed files',
    'data:',
    'ma-asset://',
    'SecretRef',
    'Never ask the user to paste a secret',
    'Co-Authored-By: Minimalist Agent',
    'GitHub Copilot (test)',
    'only after the user mentions',
  ])('mentions %s', (phrase) => {
    expect(assistantBody).toContain(phrase);
  });

  it('does not claim disabled extensions appear in the awareness block', () => {
    expect(assistantBody).not.toContain('Disabled extensions');
  });
});
