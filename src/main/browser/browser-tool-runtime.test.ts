import { describe, expect, it, vi } from 'vitest';

vi.mock('./browser-pane-manager', () => ({ browserPaneManager: {} }));
vi.mock('../logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import {
  parseFlags,
  parsePoint,
  parseRegion,
  parseViewport,
  parseWait,
} from './browser-tool-runtime';

describe('parseFlags', () => {
  it('separates positionals, boolean flags, and value flags', () => {
    const { positional, flags } = parseFlags(['20', '--failed', '--filter', '/api', '--all']);
    expect(positional).toEqual(['20']);
    expect(flags.get('failed')).toBe(true);
    expect(flags.get('filter')).toBe('/api');
    expect(flags.get('all')).toBe(true);
  });

  it('rejects a value flag with no value', () => {
    expect(() => parseFlags(['--within'])).toThrow('--within needs a value');
  });
});

describe('parseRegion', () => {
  it('parses x0,y0,x1,y1', () => {
    expect(parseRegion('0,10,200,110')).toEqual({ x0: 0, y0: 10, x1: 200, y1: 110 });
  });

  it('rejects malformed or inverted rectangles', () => {
    expect(() => parseRegion('1,2,3')).toThrow();
    expect(() => parseRegion('100,0,50,50')).toThrow('x1 > x0');
  });
});

describe('parseViewport', () => {
  it('resolves presets, custom sizes, and reset', () => {
    expect(parseViewport('mobile')).toEqual({ width: 375, height: 812, mobile: true });
    expect(parseViewport('1440x900')).toEqual({ width: 1440, height: 900, mobile: false });
    expect(parseViewport('desktop')).toBeNull();
  });

  it('rejects unknown values', () => {
    expect(() => parseViewport('huge')).toThrow('Unknown viewport');
  });
});

describe('parseWait', () => {
  it('parses each condition', () => {
    expect(parseWait(['500'])).toEqual({ kind: 'time', ms: 500 });
    expect(parseWait(['idle'])).toEqual({ kind: 'idle' });
    expect(parseWait(['text', 'Welcome', 'back'])).toEqual({ kind: 'text', text: 'Welcome back' });
    expect(parseWait(['url', '/dashboard'])).toEqual({ kind: 'url', text: '/dashboard' });
  });

  it('rejects missing or unknown conditions', () => {
    expect(() => parseWait([])).toThrow('Usage');
    expect(() => parseWait(['text'])).toThrow('needs a value');
    expect(() => parseWait(['forever'])).toThrow('Unknown wait condition');
  });
});

describe('parsePoint', () => {
  it('accepts "x y" and "x,y"', () => {
    expect(parsePoint(['10', '20.6'])).toEqual({ x: 10, y: 21 });
    expect(parsePoint(['10,20'])).toEqual({ x: 10, y: 20 });
    expect(parsePoint(['10'])).toBeNull();
    expect(parsePoint(['a', 'b'])).toBeNull();
  });
});
