# Git commit workflow

The Git review modal commits selected files and hunks through a temporary Git index. It never resets or stages into the
repository's real index before the commit succeeds.

## Index guarantees

- Existing staged entries outside the selected paths survive successful and failed attempts.
- A failed staging command, hook, timeout, or cancellation leaves the real index unchanged.
- Formatter changes made to the working tree by a hook remain on disk and appear after the automatic status refresh.
- After success, every path changed between the previous and new `HEAD` is reconciled in the real index. This includes
  paths added to the temporary index by hooks.
- Selected partial-file content becomes the committed and indexed version; remaining working-tree content stays
  unstaged.
- Partial commits are rejected while the real index contains unresolved merge entries.

The temporary index is passed through `GIT_INDEX_FILE`, so child Git processes and hooks operate on the same candidate
commit.

## Failure behavior

Commit failures return structured diagnostics: repository, execution phase, failure kind, exit code, signal, timeout or
cancellation state, stdout, and stderr. The renderer preserves the commit message, amend state, and applicable
selections, refreshes repository status, and exposes retry and command output.

`Commit without hooks` appears only after Git rejects a commit. It requires a second confirmation and invokes
`git commit --no-verify`; the app never bypasses hooks automatically.

## Multiple repositories

Every selected repository is preflighted before the first commit. Commits then run sequentially because Git cannot
atomically commit across repositories. If a later repository fails, the UI reports repositories that already committed
and removes them from the retry selection. Retrying therefore targets only unresolved repositories.
