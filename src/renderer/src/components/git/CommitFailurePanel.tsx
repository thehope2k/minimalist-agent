import { useState } from 'react';
import { AlertCircle, Check, Copy, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui';
import type { GitCommitFailure } from '../../../../shared/electron-api';
import type { GitCommitAttempt } from './diff-modal/useCommitFlow';

interface CommitFailurePanelProps {
  attempt: GitCommitAttempt;
  onRetry: () => void;
  onRetryWithoutHooks: () => void;
}

const GUIDANCE: Partial<Record<GitCommitFailure['kind'], string>> = {
  'git-config': 'Configure Git user.name and user.email, then retry.',
  'nothing-to-commit': 'Refresh the selected changes before retrying.',
  'unmerged-index': 'Resolve all merge conflicts before creating a partial commit.',
  timeout: 'The commit checks exceeded five minutes. Review their output before retrying.',
  cancelled: 'The commit was cancelled. Your message and selected changes were preserved.',
  'output-too-large': 'A commit check produced more output than the app can safely retain.',
};

function repositoryName(repoRoot: string): string {
  return repoRoot.split('/').filter(Boolean).pop() ?? repoRoot;
}

export function CommitFailurePanel({
  attempt,
  onRetry,
  onRetryWithoutHooks,
}: CommitFailurePanelProps) {
  const [copied, setCopied] = useState(false);
  const [confirmBypass, setConfirmBypass] = useState(false);
  const failure = attempt.outcomes.find((outcome) => !outcome.ok);
  if (!failure || failure.ok) return null;

  const successfulRepositories = attempt.outcomes.filter((outcome) => outcome.ok);
  const output = [failure.diagnostics.stdout, failure.diagnostics.stderr]
    .filter(Boolean)
    .join('\n');

  const copyOutput = async () => {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  };

  return (
    <div className="mt-2 rounded-md border border-red-500/30 bg-red-500/10 p-3">
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" strokeWidth={1.8} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-red-300">{failure.summary}</p>
          <p className="mt-0.5 text-[11px] text-fg-muted">
            {repositoryName(failure.repoRoot)} · {failure.phase.replace('-', ' ')}
          </p>
        </div>
      </div>

      {failure.commitCreated && (
        <p className="mt-2 text-[11px] font-medium text-amber-300">
          Commit created in {repositoryName(failure.repoRoot)}, but its staged state could not be
          refreshed.
        </p>
      )}

      {successfulRepositories.length > 0 && (
        <p className="mt-2 text-[11px] text-amber-300">
          Already committed:{' '}
          {successfulRepositories.map((item) => repositoryName(item.repoRoot)).join(', ')}
        </p>
      )}

      {attempt.notAttemptedRepoRoots.length > 0 && (
        <p className="mt-2 text-[11px] text-fg-muted">
          Not attempted: {attempt.notAttemptedRepoRoots.map(repositoryName).join(', ')}
        </p>
      )}

      {failure.workingTreeChanged && (
        <p className="mt-2 text-[11px] leading-relaxed text-amber-300">
          Files changed during the commit attempt. The file list and diffs were refreshed for
          review.
        </p>
      )}

      {GUIDANCE[failure.kind] && (
        <p className="mt-2 text-[11px] leading-relaxed text-fg-muted">{GUIDANCE[failure.kind]}</p>
      )}

      {output && (
        <details className="mt-2 text-[11px] text-fg-muted">
          <summary className="cursor-pointer select-none hover:text-fg">Command output</summary>
          <pre className="scroll-thin mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-background/60 p-2 font-mono text-[10px] leading-relaxed text-fg-muted">
            {output}
          </pre>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            icon={copied ? Check : Copy}
            onClick={() => void copyOutput()}
            className="mt-1"
          >
            {copied ? 'Copied' : 'Copy output'}
          </Button>
        </details>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {(!failure.commitCreated || attempt.notAttemptedRepoRoots.length > 0) && (
          <Button type="button" size="sm" icon={RotateCcw} onClick={onRetry}>
            {failure.commitCreated ? 'Continue remaining' : 'Retry'}
          </Button>
        )}
        {failure.kind === 'rejected' && !failure.commitCreated && !confirmBypass && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmBypass(true)}>
            Commit without hooks…
          </Button>
        )}
      </div>

      {confirmBypass && (
        <div className="mt-3 rounded border border-amber-500/30 bg-amber-500/10 p-2.5">
          <p className="text-[11px] leading-relaxed text-amber-200">
            This bypasses repository validation hooks. Continue only if you understand why the
            checks failed.
          </p>
          <div className="mt-2 flex gap-2">
            <Button type="button" size="sm" onClick={onRetryWithoutHooks}>
              Run without hooks
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmBypass(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
