import { describe, expect, it } from 'vitest';
import { formatPageRange, resolvePageRange } from './page-range';

const TOTAL_PAGES = 50;
const MAX_PAGES = 20;

describe('resolvePageRange', () => {
  it('defaults to the first pages, leaving the rest as requested', () => {
    expect(resolvePageRange(undefined, TOTAL_PAGES, MAX_PAGES)).toEqual({
      ok: true,
      range: { first: 1, last: 20 },
      requestedLast: 50,
    });
  });

  it('reads a whole short document by default', () => {
    expect(resolvePageRange(undefined, 3, MAX_PAGES)).toMatchObject({
      range: { first: 1, last: 3 },
    });
  });

  it('accepts a single page and a range with spaces', () => {
    expect(resolvePageRange('7', TOTAL_PAGES, MAX_PAGES)).toMatchObject({
      range: { first: 7, last: 7 },
      requestedLast: 7,
    });
    expect(resolvePageRange(' 3 - 12 ', TOTAL_PAGES, MAX_PAGES)).toMatchObject({
      range: { first: 3, last: 12 },
    });
  });

  it('caps a long range at the per-read maximum', () => {
    expect(resolvePageRange('10-45', TOTAL_PAGES, MAX_PAGES)).toMatchObject({
      range: { first: 10, last: 29 },
      requestedLast: 45,
    });
  });

  it('clamps a range that runs past the end', () => {
    expect(resolvePageRange('45-80', TOTAL_PAGES, MAX_PAGES)).toMatchObject({
      range: { first: 45, last: 50 },
      requestedLast: 50,
    });
  });

  it.each(['', 'abc', '1,3', '0', '5-2', '-3'])('rejects "%s"', (spec) => {
    expect(resolvePageRange(spec, TOTAL_PAGES, MAX_PAGES).ok).toBe(false);
  });

  it('rejects a document without pages', () => {
    expect(resolvePageRange(undefined, 0, MAX_PAGES)).toEqual({
      ok: false,
      message: 'PDF has no pages.',
    });
  });

  it('rejects a start page past the end', () => {
    expect(resolvePageRange('51', TOTAL_PAGES, MAX_PAGES)).toEqual({
      ok: false,
      message: 'Page 51 is beyond the end of the PDF (50 pages total).',
    });
  });
});

describe('formatPageRange', () => {
  it('prints single pages and ranges', () => {
    expect(formatPageRange({ first: 4, last: 4 })).toBe('4');
    expect(formatPageRange({ first: 4, last: 9 })).toBe('4-9');
  });
});
