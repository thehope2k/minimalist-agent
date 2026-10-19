import { describe, expect, it } from 'vitest';
import { freezeReason, intersects } from './overlay';

function box(left: number, top: number, width: number, height: number) {
  return { left, top, width, height, right: left + width, bottom: top + height };
}

function el(rect: ReturnType<typeof box>, opts: { inside?: boolean; ignored?: boolean } = {}) {
  return {
    getBoundingClientRect: () => rect,
    contains: () => false,
    closest: () => (opts.ignored ? {} : null),
    inside: opts.inside ?? false,
  };
}

function fakeDoc(overlays: ReturnType<typeof el>[], dragging = false) {
  return {
    querySelector: () => (dragging ? {} : null),
    querySelectorAll: () => overlays,
  } as unknown as Document;
}

const slotRect = box(600, 40, 500, 700);
const slot = {
  getBoundingClientRect: () => slotRect,
  contains: (other: { inside?: boolean }) => !!other.inside,
} as unknown as Element;

describe('intersects', () => {
  it('needs real overlap, not touching edges', () => {
    expect(intersects(box(0, 0, 10, 10), box(5, 5, 10, 10))).toBe(true);
    expect(intersects(box(0, 0, 10, 10), box(10, 0, 10, 10))).toBe(false);
  });
});

describe('freezeReason', () => {
  it('freezes for a resize drag anywhere', () => {
    expect(freezeReason(slot, fakeDoc([], true))).toBe('drag');
  });

  it('freezes only for overlays that overlap the slot', () => {
    expect(freezeReason(slot, fakeDoc([el(box(0, 0, 200, 200))]))).toBeNull();
    expect(freezeReason(slot, fakeDoc([el(box(550, 100, 200, 200))]))).toBe('overlay');
  });

  it('ignores the panel’s own content, opted-out elements, and empty boxes', () => {
    expect(freezeReason(slot, fakeDoc([el(box(600, 40, 50, 50), { inside: true })]))).toBeNull();
    expect(freezeReason(slot, fakeDoc([el(box(600, 40, 50, 50), { ignored: true })]))).toBeNull();
    expect(freezeReason(slot, fakeDoc([el(box(700, 100, 0, 0))]))).toBeNull();
  });
});
