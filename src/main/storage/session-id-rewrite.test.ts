import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createSessionIdRewriter, rewriteTranscriptFile } from './session-id-rewrite';

const PARENT = 'lyh25f6umv6apk7g';
const CHILD = '2o46xns6mv9ce64z';
const BASE = '/Users/me/Library/Application Support/Minimalist Agent/sessions';
const rewrite = createSessionIdRewriter(BASE, PARENT, CHILD);

describe('createSessionIdRewriter', () => {
  it('retargets raw, quoted and ma-asset references', () => {
    const input = {
      raw: `${BASE}/${PARENT}/scratch/a.py`,
      quoted: `cd "${BASE}/${PARENT}/scratch" && ls`,
      url: `ma-asset://${PARENT}/chart.png`,
    };

    expect(rewrite(input)).toEqual({
      raw: `${BASE}/${CHILD}/scratch/a.py`,
      quoted: `cd "${BASE}/${CHILD}/scratch" && ls`,
      url: `ma-asset://${CHILD}/chart.png`,
    });
  });

  it('reaches strings nested in arrays and objects', () => {
    const input = { parts: [{ input: { command: `ls ${BASE}/${PARENT}/scratch` } }] };

    expect(JSON.stringify(rewrite(input))).toContain(`${BASE}/${CHILD}/scratch`);
    expect(JSON.stringify(rewrite(input))).not.toContain(PARENT);
  });

  it('leaves signed thinking blocks byte-identical', () => {
    const thinking = {
      type: 'thinking',
      thinking: `look in ${BASE}/${PARENT}/x`,
      thinkingSignature: 's',
    };

    expect(rewrite({ content: [thinking] }).content[0]).toBe(thinking);
  });

  it('does not touch ids that merely start with the parent id', () => {
    const lookalike = `${BASE}/${PARENT}extra/scratch`;

    expect(rewrite(lookalike)).toBe(lookalike);
  });

  it('does not touch the id when it is not a session path segment', () => {
    expect(rewrite(`note: ${PARENT}`)).toBe(`note: ${PARENT}`);
  });
});

describe('rewriteTranscriptFile', () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

  it('rewrites entries but keeps the header pointing at the real parent file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rewrite-'));
    dirs.push(dir);
    const path = join(dir, 't.jsonl');
    const header = { type: 'session', parentSession: `${BASE}/${PARENT}/t.jsonl` };
    const entry = { type: 'message', message: { content: `${BASE}/${PARENT}/scratch` } };
    writeFileSync(path, `${JSON.stringify(header)}\n${JSON.stringify(entry)}\n`);

    rewriteTranscriptFile(path, rewrite);

    const [headerLine, entryLine] = readFileSync(path, 'utf-8').trim().split('\n');
    expect(JSON.parse(headerLine!)).toEqual(header);
    expect(entryLine).toContain(`${BASE}/${CHILD}/scratch`);
  });
});
