import { describe, expect, it } from 'vitest';
import { normalizeProcessFailure } from './process-error';

describe('normalizeProcessFailure', () => {
  it('keeps structured child-process diagnostics', () => {
    const error = Object.assign(new Error('Command failed'), {
      code: 1,
      signal: null,
      killed: false,
      stdout: 'hook stdout\n',
      stderr: 'hook stderr\n',
    });

    expect(normalizeProcessFailure(error)).toEqual({
      stdout: 'hook stdout',
      stderr: 'hook stderr',
      exitCode: 1,
      signal: null,
      timedOut: false,
      cancelled: false,
      outputTooLarge: false,
    });
  });

  it('identifies terminated commands as timed out', () => {
    const error = Object.assign(new Error('Command timed out'), {
      signal: 'SIGTERM',
      killed: true,
    });

    expect(normalizeProcessFailure(error).timedOut).toBe(true);
  });

  it('does not classify max-buffer termination as a timeout', () => {
    const error = Object.assign(new Error('stdout maxBuffer length exceeded'), {
      code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER',
      signal: 'SIGTERM',
      killed: true,
    });

    expect(normalizeProcessFailure(error)).toMatchObject({
      outputTooLarge: true,
      timedOut: false,
    });
  });

  it('distinguishes user cancellation from timeout', () => {
    const error = Object.assign(new Error('The operation was aborted'), {
      name: 'AbortError',
      code: 'ABORT_ERR',
    });

    expect(normalizeProcessFailure(error)).toMatchObject({ cancelled: true, timedOut: false });
  });
});
