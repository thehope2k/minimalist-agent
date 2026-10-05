import { describe, expect, it } from 'vitest';
import { validateExtensionConfigContent } from './parse';

const config = (env: Record<string, unknown>) =>
  JSON.stringify({ schemaVersion: 1, slug: 'jira', name: 'Jira', description: 'Jira', env });

describe('validateExtensionConfigContent', () => {
  it('accepts input refs and a setup block', () => {
    const raw = JSON.stringify({
      schemaVersion: 1,
      slug: 'jira',
      name: 'Jira',
      description: 'Jira',
      env: { JIRA_USERNAME: { input: 'jira.email' } },
      setup: { fields: { 'jira.email': { label: 'Atlassian email' } } },
    });
    expect(validateExtensionConfigContent(raw, 'jira').valid).toBe(true);
  });

  it('rejects a placeholder literal and points at the input ref', () => {
    const result = validateExtensionConfigContent(
      config({ JIRA_USERNAME: 'REPLACE_WITH_EMAIL' }),
      'jira',
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0].path).toBe('env.JIRA_USERNAME');
  });
});
