import { describe, expect, it } from 'vitest';
import { fromWindowsShellPath } from './read-path';

describe('fromWindowsShellPath', () => {
  it.each([
    ['/c/Users/me/x.pdf', 'C:\\Users\\me\\x.pdf'],
    ['/mnt/d/docs/x.pdf', 'D:\\docs\\x.pdf'],
    ['/cygdrive/c/x.pdf', 'C:\\x.pdf'],
    ['/c', 'C:\\'],
  ])('converts %s', (shellPath, nativePath) => {
    expect(fromWindowsShellPath(shellPath)).toBe(nativePath);
  });

  it.each(['relative/x.pdf', '//server/share/x.pdf', 'C:\\x.pdf', '/usr/local/x.pdf'])(
    'leaves %s unchanged',
    (path) => {
      expect(fromWindowsShellPath(path)).toBe(path);
    },
  );
});
