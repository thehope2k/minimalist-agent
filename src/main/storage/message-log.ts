import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  readSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import type { StoredMessage } from './session-types';
import { StringDecoder } from 'node:string_decoder';

export interface JsonlParseOptions {
  onMalformedLine?: (line: string) => void;
}

/**
 * Parses JSONL incrementally so loading a transcript does not also retain a
 * full-file string and its split-line array alongside the decoded messages.
 */
export function parseJsonlChunks<T = unknown>(
  chunks: Iterable<string>,
  options: JsonlParseOptions = {},
): T[] {
  const records: T[] = [];
  let remainder = '';

  const parseLine = (line: string): void => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      records.push(JSON.parse(trimmed) as T);
    } catch {
      options.onMalformedLine?.(trimmed);
    }
  };

  for (const chunk of chunks) {
    const lines = (remainder + chunk).split('\n');
    remainder = lines.pop() ?? '';
    for (const line of lines) parseLine(line);
  }
  parseLine(remainder);
  return records;
}

export function readJsonlFile<T = unknown>(path: string, options?: JsonlParseOptions): T[] {
  const size = statSync(path).size;
  if (size === 0) return [];

  return parseJsonlChunks<T>(readChunks(path, size), options);
}

export function replaceStoredMessage(path: string, message: StoredMessage): boolean {
  if (!existsSync(path)) return false;
  const lines = readFileSync(path, 'utf-8')
    .split('\n')
    .filter((line) => line.trim());
  for (let index = lines.length - 1; index >= 0; index--) {
    try {
      if ((JSON.parse(lines[index]) as StoredMessage).id !== message.id) continue;
      lines[index] = JSON.stringify(message);
      writeFileSync(path, `${lines.join('\n')}\n`, 'utf-8');
      return true;
    } catch {
      // Ignore malformed legacy lines while locating the requested message.
    }
  }
  return false;
}

export function writeStoredMessages(path: string, messages: readonly StoredMessage[]): void {
  writeFileSync(
    path,
    messages.length ? `${messages.map((message) => JSON.stringify(message)).join('\n')}\n` : '',
    'utf-8',
  );
}

export function truncateStoredMessages(path: string, firstDroppedId: string): number {
  if (!existsSync(path)) return 0;
  const lines = readFileSync(path, 'utf-8')
    .split('\n')
    .filter((line) => line.trim());
  const cutIndex = lines.findIndex((line) => {
    try {
      return (JSON.parse(line) as StoredMessage).id === firstDroppedId;
    } catch {
      return false;
    }
  });
  if (cutIndex < 0) return lines.length;
  const kept = lines.slice(0, cutIndex);
  writeFileSync(path, kept.length ? `${kept.join('\n')}\n` : '', 'utf-8');
  return kept.length;
}

function* readChunks(path: string, size: number): Generator<string> {
  const fd = openSync(path, 'r');
  const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, size));
  const decoder = new StringDecoder('utf8');
  try {
    let position = 0;
    while (position < size) {
      const bytesRead = readSync(fd, buffer, 0, Math.min(buffer.length, size - position), position);
      if (bytesRead === 0) break;
      const chunk = decoder.write(buffer.subarray(0, bytesRead));
      if (chunk) yield chunk;
      position += bytesRead;
    }
    const finalChunk = decoder.end();
    if (finalChunk) yield finalChunk;
  } finally {
    closeSync(fd);
  }
}
