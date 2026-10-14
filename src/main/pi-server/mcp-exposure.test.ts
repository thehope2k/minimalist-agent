import { describe, expect, it } from 'vitest';
import type { McpServerConfig } from '../agent-runtime/pi/protocol';
import type { McpServerDiagnostic } from './mcp-diagnostics';
import { applyAutoExposure, DEFERRED_TOOL_THRESHOLD } from './mcp-exposure';

const stdio = (slug: string, exposure?: McpServerConfig['exposure']): McpServerConfig => ({
  slug,
  transport: 'stdio',
  command: 'node',
  exposure,
});

const probed = (slug: string, toolCount?: number): McpServerDiagnostic => ({
  slug,
  transport: 'stdio',
  ok: true,
  toolCount,
});

describe('applyAutoExposure', () => {
  it('defers a server above the tool threshold', () => {
    const [cfg] = applyAutoExposure([stdio('big')], [probed('big', DEFERRED_TOOL_THRESHOLD + 1)]);
    expect(cfg.exposure).toBe('deferred');
  });

  it('leaves a server at or below the threshold untouched', () => {
    const [cfg] = applyAutoExposure([stdio('small')], [probed('small', DEFERRED_TOOL_THRESHOLD)]);
    expect(cfg.exposure).toBeUndefined();
  });

  it.each(['direct', 'hidden', 'codemode'] as const)(
    'keeps an author-set %s exposure',
    (exposure) => {
      const [cfg] = applyAutoExposure([stdio('big', exposure)], [probed('big', 500)]);
      expect(cfg.exposure).toBe(exposure);
    },
  );

  it('keeps servers with an unknown tool count direct', () => {
    const configs = [stdio('unprobed'), stdio('failed')];
    const diagnostics: McpServerDiagnostic[] = [
      { slug: 'failed', transport: 'stdio', ok: false, error: 'boom' },
    ];
    expect(applyAutoExposure(configs, diagnostics).map((c) => c.exposure)).toEqual([
      undefined,
      undefined,
    ]);
  });

  it('does not mutate the input configs', () => {
    const input = stdio('big');
    applyAutoExposure([input], [probed('big', 100)]);
    expect(input.exposure).toBeUndefined();
  });
});
