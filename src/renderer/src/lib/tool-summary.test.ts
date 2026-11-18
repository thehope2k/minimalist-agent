import { describe, expect, it } from 'vitest';
import { summarizeToolCall, toolIntentLabel } from './tool-summary';

describe('toolIntentLabel', () => {
  it('returns the bash description, whitespace-collapsed', () => {
    expect(toolIntentLabel('bash', { command: 'ls -la', description: '  List   files\n' })).toBe(
      'List files',
    );
  });

  it('is empty when the model gave no description', () => {
    expect(toolIntentLabel('bash', { command: 'ls' })).toBe('');
    expect(toolIntentLabel('bash', { command: 'ls', description: '   ' })).toBe('');
  });

  it('ignores description fields on non-bash tools', () => {
    expect(toolIntentLabel('Agent', { description: 'Explore repo' })).toBe('');
  });

  it('leaves the command summary intact for the hover title', () => {
    expect(
      summarizeToolCall('bash', { command: 'cd /x && npm test', description: 'Run tests' }),
    ).toBe('npm test');
  });
});

describe('browser_tool summary', () => {
  it('joins batched commands', () => {
    expect(
      summarizeToolCall('browser_tool', { commands: ['navigate http://x', 'find Login'] }),
    ).toBe('navigate http://x → find Login');
  });
});

describe('Read summary', () => {
  it('shows a line range for text files', () => {
    expect(summarizeToolCall('read', { file_path: 'notes.txt', offset: 10, limit: 5 })).toBe(
      'notes.txt:10-15',
    );
  });

  it('shows the page range for PDFs', () => {
    expect(summarizeToolCall('read', { file_path: 'report.pdf', pages: '3-12' })).toBe(
      'report.pdf p.3-12',
    );
  });
});
