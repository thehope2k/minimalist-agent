import { describe, expect, it } from 'vitest';
import { dialogGuardScript, formatDialogs, parseDialogPayload } from './browser-dialogs';

describe('parseDialogPayload', () => {
  it('accepts the three dialog types and caps message length', () => {
    expect(parseDialogPayload('{"type":"confirm","message":"Delete?"}')).toEqual({
      type: 'confirm',
      message: 'Delete?',
    });
    expect(
      parseDialogPayload(JSON.stringify({ type: 'alert', message: 'x'.repeat(900) }))?.message,
    ).toHaveLength(500);
  });

  it('rejects anything else a page might send to the binding', () => {
    expect(parseDialogPayload('not json')).toBeNull();
    expect(parseDialogPayload('{"type":"exec","message":"rm -rf"}')).toBeNull();
  });
});

describe('formatDialogs', () => {
  it('says how each dialog was answered', () => {
    expect(
      formatDialogs([
        { type: 'alert', message: 'Saved' },
        { type: 'confirm', message: 'Delete?' },
      ]),
    ).toBe(
      'Page showed alert("Saved") — dismissed.\nPage showed confirm("Delete?") — answered Cancel.',
    );
  });
});

describe('dialogGuardScript', () => {
  it('bakes in the native/guarded mode and always replaces prompt', () => {
    expect(dialogGuardScript(true)).toContain('window.__maDialogNative = true');
    expect(dialogGuardScript(false)).toContain('window.__maDialogNative = false');
    expect(dialogGuardScript(true)).toContain('window.prompt = function');
  });
});
