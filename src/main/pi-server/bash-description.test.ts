import { describe, expect, it } from 'vitest';
import { createBashToolDefinition } from '@earendil-works/pi-coding-agent';
import { withBashDescription } from './bash-description';

describe('withBashDescription', () => {
  it('adds an optional description while keeping the original parameters', () => {
    const tool = withBashDescription(createBashToolDefinition('/tmp'));
    const schema = tool.parameters as { properties: Record<string, unknown>; required?: string[] };
    expect(Object.keys(schema.properties)).toEqual(['command', 'timeout', 'description']);
    expect(schema.required ?? []).not.toContain('description');
    expect(schema.required).toContain('command');
  });
});
