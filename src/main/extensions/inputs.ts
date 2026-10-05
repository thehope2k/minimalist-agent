// Plain (non-secret) values a user supplies for an extension's `{ input }` env
// refs — email, workspace URL, region. Keyed by `<slug>::<key>`. Kept apart from
// secrets.ts so the renderer may read values back to pre-fill the Setup form.

import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { Paths } from '../storage/paths';
import { createLogger } from '../logger';

const log = createLogger('extension-inputs');

interface InputsFile {
  version: 1;
  byKey: Record<string, string>;
}

function read(): InputsFile {
  const path = Paths.extensionInputs();
  if (!existsSync(path)) return { version: 1, byKey: {} };
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as InputsFile;
    if (parsed.version === 1 && parsed.byKey) return parsed;
  } catch (e) {
    log.error('extension-inputs.json is unreadable; treating as empty', e);
  }
  return { version: 1, byKey: {} };
}

function write(file: InputsFile): void {
  const path = Paths.extensionInputs();
  if (Object.keys(file.byKey).length === 0) {
    if (existsSync(path)) unlinkSync(path);
    return;
  }
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(file, null, 2), 'utf-8');
  renameSync(tmp, path);
}

function fullKey(slug: string, key: string): string {
  return `${slug}::${key}`;
}

export function getInput(slug: string, key: string): string | null {
  return read().byKey[fullKey(slug, key)] ?? null;
}

export function setInput(slug: string, key: string, value: string): void {
  const file = read();
  file.byKey[fullKey(slug, key)] = value.trim();
  write(file);
}

export function deleteInput(slug: string, key: string): void {
  const file = read();
  delete file.byKey[fullKey(slug, key)];
  write(file);
}
