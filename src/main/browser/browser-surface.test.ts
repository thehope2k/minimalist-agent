import { describe, expect, it } from 'vitest';
import { HIDDEN_SURFACE, normalizeUserUrl, roundBounds, shouldDock } from './browser-surface';

const shown = {
  sessionId: 'a',
  bounds: { x: 0, y: 0, width: 500, height: 700 },
  visible: true,
  frozen: false,
};

describe('shouldDock', () => {
  it('docks only the visible, unfrozen, sized surface of the matching chat', () => {
    expect(shouldDock('a', shown)).toBe(true);
    expect(shouldDock('b', shown)).toBe(false);
    expect(shouldDock('a', { ...shown, frozen: true })).toBe(false);
    expect(shouldDock('a', { ...shown, visible: false })).toBe(false);
    expect(shouldDock('a', { ...shown, bounds: { ...shown.bounds, width: 0 } })).toBe(false);
    expect(shouldDock('a', HIDDEN_SURFACE)).toBe(false);
  });
});

describe('roundBounds', () => {
  it('rounds to whole pixels and clamps negative sizes', () => {
    expect(roundBounds({ x: 700.4, y: 40.6, width: 499.6, height: -2 })).toEqual({
      x: 700,
      y: 41,
      width: 500,
      height: 0,
    });
  });
});

describe('normalizeUserUrl', () => {
  it('keeps full http(s) URLs', () => {
    expect(normalizeUserUrl(' https://example.com/a ')).toBe('https://example.com/a');
  });

  it('adds http for local hosts and https for everything else', () => {
    expect(normalizeUserUrl('localhost:5173/login')).toBe('http://localhost:5173/login');
    expect(normalizeUserUrl('127.0.0.1:8080')).toBe('http://127.0.0.1:8080/');
    expect(normalizeUserUrl('example.com')).toBe('https://example.com/');
  });

  it('rejects other schemes and non-addresses', () => {
    expect(normalizeUserUrl('file:///etc/passwd')).toBeNull();
    expect(normalizeUserUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeUserUrl('how do I center a div')).toBeNull();
    expect(normalizeUserUrl('   ')).toBeNull();
  });
});
