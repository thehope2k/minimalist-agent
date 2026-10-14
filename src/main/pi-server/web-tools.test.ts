import { describe, expect, it } from 'vitest';
import { clampResult } from './web-tools';

describe('clampResult', () => {
  it('returns short text untouched', () => {
    expect(clampResult('hello\nworld')).toBe('hello\nworld');
  });

  it('keeps whole leading lines and appends a size notice', () => {
    const text = Array.from({ length: 10_000 }, (_, i) => `line ${i}`).join('\n');
    const out = clampResult(text);
    expect(out.startsWith('line 0\nline 1\n')).toBe(true);
    expect(out).toMatch(/\[\.\.\. truncated; showing first .* of .*\]$/);
    expect(out).not.toContain('line 9999');
  });

  it('does not return empty output for a single huge line (minified JSON)', () => {
    const out = clampResult(JSON.stringify({ data: 'x'.repeat(200_000) }));
    expect(out.startsWith('{"data":"xxx')).toBe(true);
    expect(out).toContain('truncated');
  });

  it('does not apply a line cap below the byte budget', () => {
    const text = Array.from({ length: 5000 }, () => 'a').join('\n'); // ~10 KB, 5000 lines
    expect(clampResult(text)).toBe(text);
  });
});
