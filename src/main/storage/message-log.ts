import { closeSync, openSync, readSync, statSync } from 'node:fs';
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
