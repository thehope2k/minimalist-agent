/**
 * Smoke-test for safe-bash.ts
 *
 * Run with:  node --import tsx/esm src/main/agent/__tests__/safe-bash.smoke.ts
 * (or add vitest / bun:test when a test runner is configured)
 *
 * Exits 0 on success, 1 with a failure summary on any assertion error.
 */

import { isSafeBashCommand, isUnsafeSyntax, splitCompound } from '../safe-bash.js';

// ── Tiny assertion helpers ────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function ok(actual: boolean, label: string) {
  if (actual) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label}`);
    failed++;
  }
}

function section(name: string) {
  console.log(`\n${name}`);
}

// ── isUnsafeSyntax ────────────────────────────────────────────────────────────

section('isUnsafeSyntax — should be SAFE (return false)');
ok(!isUnsafeSyntax('git status'), 'plain command');
ok(!isUnsafeSyntax("echo 'hello $(rm -rf /)'"), 'substitution inside single quotes');
ok(!isUnsafeSyntax('grep -r "TODO" .'), 'double-quoted arg, no substitution');
ok(!isUnsafeSyntax('git log 2>&1'), 'fd duplication 2>&1');
ok(!isUnsafeSyntax('npm test 2>/dev/null'), 'redirect to /dev/null');
ok(!isUnsafeSyntax('cat < file.txt'), 'input redirect');

section('isUnsafeSyntax — should be UNSAFE (return true)');
ok(isUnsafeSyntax('ls $(pwd)'), 'command substitution $()');
ok(isUnsafeSyntax('ls `pwd`'), 'backtick substitution');
ok(isUnsafeSyntax('cat <(echo hi)'), 'process substitution <()');
ok(isUnsafeSyntax('echo x > file.txt'), 'output redirect to file');
ok(isUnsafeSyntax('echo x >> file.txt'), 'append redirect');
ok(isUnsafeSyntax('git log &'), 'background execution &');
ok(isUnsafeSyntax('PATH=/evil ls'), 'env-var assignment');
ok(isUnsafeSyntax('echo "a$(rm)b"'), 'substitution inside double quotes');

// ── splitCompound ─────────────────────────────────────────────────────────────

section('splitCompound');
const s1 = splitCompound('git status && git log');
ok(s1.length === 2 && s1[0] === 'git status' && s1[1] === 'git log', '&&');

const s2 = splitCompound('git log | head -20');
ok(s2.length === 2 && s2[0] === 'git log' && s2[1] === 'head -20', '|');

const s3 = splitCompound("echo 'a||b'");
ok(s3.length === 1, '|| inside single quotes — not split');

const s4 = splitCompound('ls; pwd');
ok(s4.length === 2 && s4[0] === 'ls' && s4[1] === 'pwd', ';');

const s5 = splitCompound('git status || echo failed');
ok(s5.length === 2, '||');

// ── isSafeBashCommand — should ALLOW ──────────────────────────────────────────

section('isSafeBashCommand — should ALLOW');

// Basic read-only commands
ok(isSafeBashCommand('git status'), 'git status');
ok(isSafeBashCommand('git log --oneline -20'), 'git log with flags');
ok(isSafeBashCommand('git diff HEAD~1'), 'git diff');
ok(isSafeBashCommand('git -C /some/path status'), 'git -C /path status');
ok(isSafeBashCommand('git --no-pager log'), 'git --no-pager log');
ok(isSafeBashCommand('ls -la src/'), 'ls with flags');
ok(isSafeBashCommand('cat README.md'), 'cat');
ok(isSafeBashCommand('head -20 file.ts'), 'head');
ok(isSafeBashCommand('tail -f app.log'), 'tail');
ok(isSafeBashCommand('grep -r "TODO" .'), 'grep');
ok(isSafeBashCommand('rg "pattern" src/'), 'ripgrep');
ok(isSafeBashCommand('find . -name "*.ts" -type f'), 'find (safe)');
ok(isSafeBashCommand('which node'), 'which');
ok(isSafeBashCommand('pwd'), 'pwd');
ok(isSafeBashCommand('echo hello'), 'echo');
ok(isSafeBashCommand('jq . package.json'), 'jq');
ok(isSafeBashCommand('npm outdated'), 'npm outdated');
ok(isSafeBashCommand('npm ls'), 'npm ls');
ok(isSafeBashCommand('node --version'), 'node --version');
ok(isSafeBashCommand('python3 --version'), 'python3 --version');
ok(isSafeBashCommand('go version'), 'go version');
ok(isSafeBashCommand('cd src/'), 'cd');
ok(isSafeBashCommand('tsc --noEmit'), 'tsc --noEmit');
ok(isSafeBashCommand('bun run typecheck'), 'bun run typecheck');
ok(isSafeBashCommand('sort file.txt'), 'sort');
ok(isSafeBashCommand('sed -n "1,10p" file.ts'), 'sed -n (print-only)');
ok(isSafeBashCommand("awk '{print $1}' file.txt"), 'awk safe form');
ok(isSafeBashCommand('git stash list'), 'git stash list');
ok(isSafeBashCommand('git blame README.md'), 'git blame');
ok(isSafeBashCommand('gh pr list'), 'gh pr list');
ok(isSafeBashCommand('gh issue view 42'), 'gh issue view');
ok(isSafeBashCommand('some-cmd --help'), '--help flag');

// Compound commands — all-safe parts
ok(isSafeBashCommand('git status && git log --oneline -5'), '&& all safe');
ok(isSafeBashCommand('cat package.json | jq .version'), 'pipe both safe');
ok(isSafeBashCommand('ls src/ | grep test'), 'ls | grep');
ok(isSafeBashCommand('git log | head -20'), 'git log | head');
ok(isSafeBashCommand('npm outdated || echo "all up to date"'), '|| with echo');

// Safe redirect forms
ok(isSafeBashCommand('git log 2>/dev/null'), 'redirect to /dev/null');
ok(isSafeBashCommand('git log 2>&1'), 'fd duplication 2>&1');

// ── isSafeBashCommand — should BLOCK ──────────────────────────────────────────

section('isSafeBashCommand — should BLOCK');

// Not in the allowlist
ok(!isSafeBashCommand('rm -rf dist/'), 'rm -rf');
ok(!isSafeBashCommand('curl https://example.com'), 'curl');
ok(!isSafeBashCommand('wget https://example.com'), 'wget');
ok(!isSafeBashCommand('npm install lodash'), 'npm install');
ok(!isSafeBashCommand('npm run build'), 'npm run build (not typecheck)');
ok(!isSafeBashCommand('git push origin main'), 'git push');
ok(!isSafeBashCommand('git reset --hard HEAD~1'), 'git reset');
ok(!isSafeBashCommand('ssh user@host'), 'ssh');
ok(!isSafeBashCommand('sudo ls'), 'sudo');

// Dangerous syntax
ok(!isSafeBashCommand('ls $(pwd)'), 'command substitution');
ok(!isSafeBashCommand('git log > CHANGELOG.txt'), 'redirect to real file');
ok(!isSafeBashCommand('echo x >> log.txt'), 'append redirect');
ok(!isSafeBashCommand('git log &'), 'background execution');
ok(!isSafeBashCommand('PATH=/evil ls'), 'env-var assignment');

// Compound with at least one unsafe part
ok(!isSafeBashCommand('git status && rm -rf /'), 'safe && unsafe');
ok(!isSafeBashCommand('ls | rm -rf .'), 'safe | unsafe');

// Post-match guards
ok(!isSafeBashCommand('find . -name "*.js" -exec rm {} \\;'), 'find -exec');
ok(!isSafeBashCommand('find . -delete'), 'find -delete');
ok(!isSafeBashCommand("awk '{ system(\"rm\") }' file"), 'awk system()');
ok(!isSafeBashCommand("awk '{ print | \"cat\" }' file"), 'awk print | cmd');

// sed write mode (no -n)
ok(!isSafeBashCommand('sed s/foo/bar/g file.txt'), 'sed in-place (no -n)');

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log('All assertions passed ✓');
}
