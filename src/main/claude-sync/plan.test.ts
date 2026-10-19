import { describe, expect, it } from 'vitest';
import { buildPlan, type Desired, type Manifest } from './plan';

const want = (name: string, hash = 'h1', over: Partial<Desired> = {}): Desired => ({
  kind: 'skill',
  name,
  source: `Skill · ${name}`,
  hash,
  warnings: [],
  ...over,
});

const actions = (items: ReturnType<typeof buildPlan>) =>
  Object.fromEntries(items.map((i) => [i.name, i.action]));

describe('buildPlan', () => {
  it('adds, leaves unchanged, and updates MA-owned entries', () => {
    const manifest: Manifest = {
      'skill:same': { hash: 'h1', source: 's' },
      'skill:changed': { hash: 'old', source: 's' },
    };
    const existing = (_k: string, name: string) =>
      ({ same: 'h1', changed: 'old' })[name as 'same' | 'changed'];
    expect(
      actions(buildPlan([want('new'), want('same'), want('changed')], manifest, existing)),
    ).toEqual({
      new: 'add',
      same: 'unchanged',
      changed: 'update',
    });
  });

  it("never overwrites a Claude item MA didn't create", () => {
    const [item] = buildPlan([want('mine')], {}, () => 'theirs');
    expect(item).toMatchObject({
      action: 'skip',
      reason: expect.stringContaining("wasn't created by MA"),
    });
  });

  it('warns when an MA-owned copy was edited in Claude', () => {
    const [item] = buildPlan(
      [want('x', 'h1')],
      { 'skill:x': { hash: 'h1', source: 's' } },
      () => 'edited',
    );
    expect(item.action).toBe('update');
    expect(item.warnings.at(-1)).toContain('edited in Claude');
  });

  it('removes MA-owned items that are gone from MA, and ignores ones already deleted', () => {
    const manifest: Manifest = {
      'skill:gone': { hash: 'h', source: 'Skill · Gone' },
      'skill:vanished': { hash: 'h', source: 'Skill · Vanished' },
    };
    const items = buildPlan([], manifest, (_k, name) => (name === 'gone' ? 'h' : undefined));
    expect(items).toEqual([
      expect.objectContaining({ name: 'gone', action: 'remove', source: 'Skill · Gone' }),
    ]);
  });

  it('keeps a previously synced item when it is skipped this time', () => {
    const manifest: Manifest = { 'mcp:pm': { hash: 'h', source: 's' } };
    const items = buildPlan(
      [want('pm', undefined, { kind: 'mcp', hash: undefined, skip: 'needs a secret' })],
      manifest,
      () => '',
    );
    expect(items).toEqual([expect.objectContaining({ name: 'pm', action: 'skip' })]);
  });

  it('skips a second MA item that would land on the same name', () => {
    expect(
      buildPlan([want('dup'), want('dup', 'h2')], {}, () => undefined).map((i) => i.action),
    ).toEqual(['add', 'skip']);
  });
});

describe('buildPlan exclusions', () => {
  it('lists an excluded item that was never synced as excluded', () => {
    const [item] = buildPlan([want('skip-me')], {}, () => undefined, new Set(['skill:skip-me']));
    expect(item).toMatchObject({ action: 'excluded', excluded: true, selectable: true });
  });

  it('removes an excluded item MA already synced', () => {
    const [item] = buildPlan(
      [want('synced')],
      { 'skill:synced': { hash: 'h1', source: 's' } },
      () => 'h1',
      new Set(['skill:synced']),
    );
    expect(item).toMatchObject({ action: 'remove', excluded: true, reason: 'excluded by you' });
  });

  it('lets skips and removals of items gone from MA stay unselectable', () => {
    const items = buildPlan(
      [want('blocked', undefined, { hash: undefined, skip: 'needs a secret' })],
      { 'skill:gone': { hash: 'h', source: 's' } },
      (_k, name) => (name === 'gone' ? 'h' : undefined),
    );
    expect(items.map((i) => [i.name, i.action, i.selectable])).toEqual([
      ['blocked', 'skip', false],
      ['gone', 'remove', false],
    ]);
  });
});
