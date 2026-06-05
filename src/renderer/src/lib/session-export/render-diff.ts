// Static unified-diff HTML from old/new strings. LCS over lines (inputs are
// already capped by the truncate pass, so O(n*m) is bounded). For a Write
// (oldValue === '') every line is an addition.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

type Op = { type: 'ctx' | 'add' | 'del'; text: string };

function diffLines(oldText: string, newText: string): Op[] {
  const a = oldText ? oldText.split('\n') : [];
  const b = newText ? newText.split('\n') : [];
  if (a.length === 0) return b.map((text) => ({ type: 'add', text }));
  if (b.length === 0) return a.map((text) => ({ type: 'del', text }));

  // LCS table.
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0),
  );
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      ops.push({ type: 'ctx', text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: 'del', text: a[i] });
      i++;
    } else {
      ops.push({ type: 'add', text: b[j] });
      j++;
    }
  }
  while (i < m) ops.push({ type: 'del', text: a[i++] });
  while (j < n) ops.push({ type: 'add', text: b[j++] });
  return ops;
}

const SIGIL: Record<Op['type'], string> = { ctx: ' ', add: '+', del: '-' };

export function renderDiff(oldValue: string, newValue: string): string {
  const ops = diffLines(oldValue, newValue);
  const rows = ops
    .map(
      (op) =>
        `<div class="me-diff-line me-diff-${op.type}"><span class="me-diff-sigil">${SIGIL[op.type]}</span><span class="me-diff-text">${escapeHtml(op.text) || '&nbsp;'}</span></div>`,
    )
    .join('');
  return `<div class="me-diff">${rows}</div>`;
}
