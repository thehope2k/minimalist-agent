/**
 * Heuristic language detection from text content.
 * Pure, synchronous, no external deps — typically < 1ms for 10KB inputs.
 */
export function detectLanguage(text: string): string {
  const head = text.trimStart().slice(0, 600);

  if (/^#!.*\b(bash|sh|zsh|fish)\b/.test(head)) return 'bash';
  if (/^<\?xml\b/i.test(head)) return 'xml';
  if (/^<!DOCTYPE html|^<html\b/i.test(head)) return 'html';

  // JSON — must parse cleanly
  const trimmed = text.trim();
  if (/^[{[]/.test(trimmed)) {
    try { JSON.parse(trimmed); return 'json'; } catch {}
  }

  // TypeScript — check before JS to catch type annotations
  if (
    /\bimport\b.*\bfrom\b|export\s+(default|const|function|class|type|interface)\b/.test(head) &&
    /:\s*(string|number|boolean|void|any|unknown|never)\b|interface\s+\w|type\s+\w+\s*=/.test(head)
  ) return 'typescript';

  // JSX/TSX heuristic
  if (/\bimport\b.*\bfrom\b|export\s+(default|const|function|class)\b/.test(head) &&
      /<[A-Z]\w+[\s/>]/.test(head)) {
    return /:\s*(string|number|boolean|void|any)\b|interface\s+\w/.test(head)
      ? 'tsx'
      : 'jsx';
  }

  // JavaScript
  if (/\bimport\b.*\bfrom\b|export\s+(default|const|function|class)\b|const\s+\w+\s*=|let\s+\w+\s*=/.test(head)) return 'javascript';

  // Python
  if (/^(import |from \w+\s+import |def \w+\s*\(|class \w+[:(]|@\w+)/m.test(head) &&
      !/[{}]/.test(head.slice(0, 80))) return 'python';

  // SQL
  if (/\b(SELECT|INSERT|UPDATE|DELETE|CREATE TABLE|ALTER TABLE|DROP TABLE)\b/i.test(head)) return 'sql';

  // Go
  if (/^package \w+|^import \(|^func \w+\s*\(/m.test(head)) return 'go';

  // Rust
  if (/^(use |fn |impl |struct |enum |mod |pub )\w/m.test(head)) return 'rust';

  // Java / Kotlin
  if (/^(package |import java\.|public class |public interface |@interface )/m.test(head)) return 'java';

  // CSS / SCSS
  if (/[.#]?\w[\w-]*\s*\{[\s\S]*?:\s*[\w#"'(][\s\S]*?;/.test(head)) return 'css';

  // YAML — key: value pattern without braces
  if (/^---\s*$/m.test(head) || (/^\w[\w-]*\s*:/m.test(head) && !head.includes('{'))) return 'yaml';

  // Markdown
  if (/^#{1,6}\s|\*\*.+\*\*|\[.+\]\(.+\)|^---$/m.test(head)) return 'markdown';

  // Shell script (fallback)
  if (/^(echo |export |if \[|for \w+ in |while |case )/m.test(head)) return 'bash';

  return 'plaintext';
}

/** Map language → display label for UI chips. */
export const LANGUAGE_LABELS: Record<string, string> = {
  typescript: 'TS',
  javascript: 'JS',
  tsx: 'TSX',
  jsx: 'JSX',
  python: 'PY',
  json: 'JSON',
  html: 'HTML',
  css: 'CSS',
  yaml: 'YAML',
  sql: 'SQL',
  bash: 'SH',
  go: 'GO',
  rust: 'RS',
  java: 'JAVA',
  xml: 'XML',
  markdown: 'MD',
  plaintext: 'TXT',
};

export function languageLabel(lang: string): string {
  return LANGUAGE_LABELS[lang] ?? lang.toUpperCase().slice(0, 4);
}
