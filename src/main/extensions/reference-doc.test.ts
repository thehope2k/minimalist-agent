import { describe, expect, it } from 'vitest';
import { EXTENSIONS_REFERENCE_MD } from './reference-doc';

describe('extension authoring reference', () => {
  it('defines guide.md as an agent operational playbook', () => {
    expect(EXTENSIONS_REFERENCE_MD).toContain('operational playbook for the agent');
    expect(EXTENSIONS_REFERENCE_MD).toMatch(/not a human-facing README or setup\s+tutorial/);
    expect(EXTENSIONS_REFERENCE_MD).toContain('## Workflow');
    expect(EXTENSIONS_REFERENCE_MD).toContain('## Safety constraints');
  });
});
