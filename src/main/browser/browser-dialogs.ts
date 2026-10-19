// Non-blocking replacements for alert/confirm/prompt, injected into every
// document of a pane page (BROWSER-PANE.md §4.3). Electron would otherwise
// show a native message box for alert/confirm (blocking a page nobody may be
// looking at) and hangs outright on prompt, which it doesn't implement.
//
// While the user controls the page, alert/confirm fall through to the native
// dialogs so a human can still answer "Delete?". prompt is always replaced.

export const DIALOG_BINDING = '__maDialog';

export interface PageDialog {
  type: 'alert' | 'confirm' | 'prompt';
  message: string;
}

export function dialogGuardScript(native: boolean): string {
  return `(() => {
  if (window.__maDialogGuard) { window.__maDialogNative = ${native}; return; }
  window.__maDialogGuard = true;
  window.__maDialogNative = ${native};
  const original = { alert: window.alert, confirm: window.confirm };
  const report = (type, message) => {
    try { ${DIALOG_BINDING}(JSON.stringify({ type, message: String(message ?? '') })); } catch {}
  };
  window.alert = function (message) {
    if (window.__maDialogNative) return original.alert.call(window, message);
    report('alert', message);
  };
  window.confirm = function (message) {
    if (window.__maDialogNative) return original.confirm.call(window, message);
    report('confirm', message);
    return false;
  };
  window.prompt = function (message) {
    report('prompt', message);
    return null;
  };
})();`;
}

export function parseDialogPayload(payload: string): PageDialog | null {
  try {
    const parsed = JSON.parse(payload) as { type?: unknown; message?: unknown };
    if (parsed.type !== 'alert' && parsed.type !== 'confirm' && parsed.type !== 'prompt') {
      return null;
    }
    return { type: parsed.type, message: String(parsed.message ?? '').slice(0, 500) };
  } catch {
    return null;
  }
}

export function formatDialogs(dialogs: PageDialog[]): string {
  const answer = { alert: 'dismissed', confirm: 'answered Cancel', prompt: 'answered Cancel' };
  return dialogs
    .map((d) => `Page showed ${d.type}(${JSON.stringify(d.message)}) — ${answer[d.type]}.`)
    .join('\n');
}
