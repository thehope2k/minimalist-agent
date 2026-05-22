// Builds the diff context string sent to the AI for commit message generation.
// Fetches fresh diffs via IPC for all staged files — no Monaco cache involved.

import type { GitFileEntry, GitRepo } from './types';

interface BuildDiffContextArgs {
  repos: GitRepo[];
  staged: GitFileEntry[];
  cwd: string;
  amend: boolean;
}

interface DiffContextResult {
  context: string;
  connectionNeeded: boolean;
}

export async function buildDiffContext(args: BuildDiffContextArgs): Promise<string> {
  const { repos, staged, cwd: _cwd, amend } = args;

  // Fetch fresh diffs for ALL staged files in parallel.
  const diffs = await Promise.all(
    staged.map((f) =>
      window.api.git.diff({
        repoRoot: f.repoRoot,
        relativePath: f.relativePath,
        absolutePath: f.absolutePath,
        status: f.status,
      }).catch(() => null),
    ),
  );

  // Group by repo, keeping diff index aligned.
  const byRepo = new Map<string, Array<{ file: GitFileEntry; diff: typeof diffs[0] }>>();
  staged.forEach((file, i) => {
    const group = byRepo.get(file.repoRoot) ?? [];
    group.push({ file, diff: diffs[i] });
    byRepo.set(file.repoRoot, group);
  });

  const roots = [...byRepo.keys()];

  // Fetch branch names in parallel.
  const branches = await Promise.all(roots.map((r) => window.api.git.branchName(r)));
  const branchMap = new Map(roots.map((r, i) => [r, branches[i]]));

  const MAX_CHARS = 10_000;
  const lines: string[] = [];

  // Amend context — prepend what the last commit contained.
  if (amend) {
    const firstRoot = roots[0];
    const [lastMsg, lastDiff] = await Promise.all([
      firstRoot ? window.api.git.lastCommitMessage(firstRoot) : Promise.resolve(null),
      firstRoot ? window.api.git.lastCommitDiff(firstRoot)   : Promise.resolve(null),
    ]);
    if (lastMsg) {
      lines.push('AMENDING COMMIT:');
      lines.push('---');
      lines.push(lastMsg.trim());
      lines.push('---');
      if (lastDiff) {
        // Full diff of the last commit — AI needs all of it to understand
        // what the original commit contained before synthesizing the amendment.
        lines.push('Previous commit diff:');
        lines.push(lastDiff.slice(0, 5000));
      }
      lines.push('', 'ADDITIONAL STAGED CHANGES:', '');
    }
  }

  // Summary header so AI understands the scale of changes.
  const totalFiles = staged.length;
  const totalAdded = diffs.reduce((n, d) => {
    if (!d) return n;
    const origSet = new Set(d.original.split('\n').map((l) => l.trim()));
    return n + d.modified.split('\n').filter((l) => l.trim() && !origSet.has(l.trim())).length;
  }, 0);
  if (!amend) {
    lines.push(`${totalFiles} file${totalFiles !== 1 ? 's' : ''} changed, ~${totalAdded} additions`, '');
  }

  // One section per repo with actual +/- lines.
// One section per repo with all meaningful +/- lines, budget-governed.
  for (const [root, entries] of byRepo) {
    const branch = branchMap.get(root);
    const repoName = root.split('/').filter(Boolean).pop() ?? root;
    lines.push(`=== ${repoName}${branch ? ` (${branch})` : ''} ===`);

    for (const { file, diff } of entries) {
      const statusLabel =
        file.status === 'A' || file.status === '?' ? 'new file'
        : file.status === 'D' ? 'deleted'
        : file.status === 'R' ? 'renamed'
        : 'modified';
      lines.push(`[${statusLabel}] ${file.relativePath}`);
      if (diff) {
        const origSet = new Set(diff.original.split('\n').map((l) => l.trim()).filter(Boolean));
        const modSet  = new Set(diff.modified.split('\n').map((l) => l.trim()).filter(Boolean));
        // Only lines with real semantic content (not pure punctuation/closers).
        const meaningful = (l: string) => l.length > 12 && !/^[{};()\[\],./\\]*$/.test(l);
        const removed = diff.original.split('\n').map((l) => l.trim())
          .filter((l) => l && !modSet.has(l)  && meaningful(l));
        const added   = diff.modified.split('\n').map((l) => l.trim())
          .filter((l) => l && !origSet.has(l) && meaningful(l));
        removed.forEach((l) => lines.push('- ' + l.slice(0, 120)));
        added.forEach((l)   => lines.push('+ ' + l.slice(0, 120)));
      }
    }
    lines.push('');
    // Stop adding repos once we hit the budget.
    if (lines.join('\n').length > MAX_CHARS) break;
  }

  return lines.join('\n').slice(0, MAX_CHARS);
}
