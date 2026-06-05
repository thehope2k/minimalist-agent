// Redaction pass: strip machine-identifying paths and obvious secrets from
// every text-bearing field of the ExportModel. Runs for BOTH modes — sharing
// makes any leak permanent, so this is non-optional.
//
// Two scrubbers:
//   collapsePaths  -> /Users/<name>/...  ->  ~/...   (drops username + layout)
//   scrubSecrets   -> known token shapes ->  «redacted:kind»

import type {
  ExportModel,
  ExportPart,
  ExportRow,
  ExportSubagent,
} from './types';

const REDACT = '«redacted»';

// Home-dir prefixes across platforms -> "~". Keeps the basename context but
// removes the username and absolute layout.
const PATH_PATTERNS: Array<[RegExp, string]> = [
  [/\/Users\/[^/\s"']+/g, '~'],
  [/\/home\/[^/\s"']+/g, '~'],
  [/[A-Za-z]:\\Users\\[^\\\s"']+/g, '~'],
];

// Targeted secret shapes. Deliberately conservative to avoid mangling normal
// code — we match well-known prefixes / formats, not generic long strings.
const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/sk-[A-Za-z0-9_-]{16,}/g, `${REDACT}:openai-key`],
  [/sk-ant-[A-Za-z0-9_-]{16,}/g, `${REDACT}:anthropic-key`],
  [/gh[pousr]_[A-Za-z0-9]{20,}/g, `${REDACT}:github-token`],
  [/github_pat_[A-Za-z0-9_]{20,}/g, `${REDACT}:github-pat`],
  [/xox[baprs]-[A-Za-z0-9-]{10,}/g, `${REDACT}:slack-token`],
  [/AKIA[0-9A-Z]{16}/g, `${REDACT}:aws-key`],
  [/AIza[0-9A-Za-z_-]{35}/g, `${REDACT}:google-key`],
  [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, `${REDACT}:jwt`],
  // Authorization: Bearer <token>
  [/(Bearer\s+)[A-Za-z0-9._-]{16,}/gi, `$1${REDACT}`],
  // key/secret/token/password = "value" assignments
  [
    /\b(api[_-]?key|secret|token|password|passwd|pwd)\b(\s*[:=]\s*)(['"]?)[^\s'"]{8,}\3/gi,
    `$1$2$3${REDACT}$3`,
  ],
];

function scrub(text: string): string {
  let out = text;
  for (const [re, rep] of PATH_PATTERNS) out = out.replace(re, rep);
  for (const [re, rep] of SECRET_PATTERNS) out = out.replace(re, rep);
  return out;
}

export function redactModel(model: ExportModel): ExportModel {
  model.meta.title = scrub(model.meta.title);
  for (const row of model.rows) redactRow(row);
  return model;
}

function redactRow(row: ExportRow): void {
  if (row.kind !== 'turn') return;
  for (const part of row.turn.parts) redactPart(part);
}

function redactPart(part: ExportPart): void {
  switch (part.kind) {
    case 'text':
    case 'thinking':
      part.text = scrub(part.text);
      break;
    case 'tool':
      if (part.inputText) part.inputText = scrub(part.inputText);
      if (part.result) part.result.content = scrub(part.result.content);
      if (part.subagent) redactSubagent(part.subagent);
      break;
    case 'diff':
      part.filePath = scrub(part.filePath);
      part.oldValue = scrub(part.oldValue);
      part.newValue = scrub(part.newValue);
      if (part.errorContent) part.errorContent = scrub(part.errorContent);
      break;
    case 'todo':
      for (const item of part.items) item.content = scrub(item.content);
      break;
  }
}

function redactSubagent(sub: ExportSubagent): void {
  for (const part of sub.parts) redactPart(part);
  if (sub.error) sub.error = scrub(sub.error);
}
