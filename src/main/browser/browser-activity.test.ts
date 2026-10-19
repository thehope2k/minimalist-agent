import { describe, expect, it } from 'vitest';
import { describeCommand } from './browser-activity';

const refs = (ref: string) => (ref === '@e4' ? 'button "Sign in"' : null);

describe('describeCommand', () => {
  it('names the element when the ref is known', () => {
    expect(describeCommand('click', ['@e4'], refs)).toBe('clicking button "Sign in"');
    expect(describeCommand('fill', ['@e9', 'x'], refs)).toBe('typing into @e9');
  });

  it('summarizes navigation and waits', () => {
    expect(describeCommand('navigate', ['http://localhost:5173/login'], refs)).toBe(
      'opening localhost:5173',
    );
    expect(describeCommand('wait', ['text', 'Welcome', 'back'], refs)).toBe(
      'waiting for "Welcome back"',
    );
    expect(describeCommand('find', ['Login'], refs)).toBe('reading the page');
  });

  it('returns null for commands that are not page activity', () => {
    expect(describeCommand('release', [], refs)).toBeNull();
    expect(describeCommand('close', [], refs)).toBeNull();
    expect(describeCommand(undefined, [], refs)).toBeNull();
  });
});
