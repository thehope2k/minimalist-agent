import { describe, expect, it } from 'vitest';
import type { ConnectionMeta } from '@/lib/electron';
import { withCurrentPick } from './use-chat-retry';
import type { SendArgs } from './types';

const connectionOf = (slug: string) => ({ slug }) as ConnectionMeta;

const previousSend: SendArgs = {
  text: 'hello',
  connection: connectionOf('old'),
  model: 'old-model',
  permissionMode: 'auto',
};

describe('withCurrentPick', () => {
  it('replaces the remembered connection and model with the current pick', () => {
    const resent = withCurrentPick(previousSend, {
      connection: connectionOf('new'),
      model: 'new-model',
    });

    expect(resent.connection.slug).toBe('new');
    expect(resent.model).toBe('new-model');
    expect(resent.text).toBe('hello');
  });

  it('keeps the remembered send when no current pick is known', () => {
    expect(withCurrentPick(previousSend)).toBe(previousSend);
  });
});
