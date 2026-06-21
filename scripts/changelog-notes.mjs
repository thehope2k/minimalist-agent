#!/usr/bin/env node
// Extract release metadata for a given version from CHANGELOG.md.
//
// Usage:
//   node scripts/changelog-notes.mjs <version> [--field=title|notes]
//
// With no --field, prints both as GITHUB_OUTPUT-style key=value lines using a
// heredoc for the multi-line notes (safe to append to $GITHUB_OUTPUT in CI).
//
// title — derived as "vX.Y.Z — <summary>", where <summary> is the first
//         paragraph under the version header, trimmed to TITLE_MAX chars.
// notes — the full section body (everything after the header line, up to the
//         next "## [" entry), with any trailing "---" separators removed.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const TITLE_MAX = 60;

const version = process.argv[2];
if (!version) {
  console.error('usage: changelog-notes.mjs <version> [--field=title|notes]');
  process.exit(1);
}

const fieldArg = process.argv.find((a) => a.startsWith('--field='));
const field = fieldArg ? fieldArg.split('=')[1] : null;

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const changelog = readFileSync(resolve(root, 'CHANGELOG.md'), 'utf8');

// Locate the "## [X.Y.Z]" header for this version, then capture everything up
// to the next "## [" header (the previous release).
const lines = changelog.split('\n');
const headerIdx = lines.findIndex((l) =>
  l.startsWith(`## [${version}]`),
);
if (headerIdx === -1) {
  console.error(`✗ No CHANGELOG entry found for version ${version}`);
  process.exit(1);
}

let endIdx = lines.length;
for (let i = headerIdx + 1; i < lines.length; i++) {
  if (lines[i].startsWith('## [')) {
    endIdx = i;
    break;
  }
}

// Body = lines after the header, excluding standalone "---" separators and
// trimming leading/trailing blank lines.
const body = lines
  .slice(headerIdx + 1, endIdx)
  .filter((l) => l.trim() !== '---')
  .join('\n')
  .replace(/^\n+/, '')
  .replace(/\n+$/, '');

// Summary = first non-empty paragraph of the body (before the first "###").
const summary = body
  .split('\n')
  .find((l) => l.trim() !== '' && !l.startsWith('#'))
  ?.trim()
  ?.replace(/\.$/, '') ?? '';

const prefix = `v${version} — `;
let title = prefix + summary;
if (title.length > TITLE_MAX) {
  const budget = TITLE_MAX - prefix.length - 1; // room for an ellipsis
  title = prefix + summary.slice(0, Math.max(0, budget)).trimEnd() + '…';
}

if (field === 'title') {
  process.stdout.write(title);
} else if (field === 'notes') {
  process.stdout.write(body);
} else {
  // GITHUB_OUTPUT-friendly: single-line title, heredoc-delimited notes.
  const out = [
    `title=${title}`,
    `notes<<__CHANGELOG_NOTES__`,
    body,
    `__CHANGELOG_NOTES__`,
  ].join('\n');
  process.stdout.write(out + '\n');
}
