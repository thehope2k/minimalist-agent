// "Test connection": spawn/connect the extension's MCP server once, list its
// tools, disconnect. Lets the user verify setup without starting a chat.

import { probeMcpServers } from '../pi-server/mcp-diagnostics';
import { hasConsent, recordMcpStatus, toResolvedConfig } from './mcp-config';
import { envLookupFor, listMissingSetup } from './setup';
import type { McpTestResult } from '../../shared/electron-api';
import { isSecretRef, type LoadedExtension } from './types';

// First run of `npx`/`uvx` downloads the package, which outlasts the in-session probe budget.
const TEST_CONNECT_TIMEOUT_MS = 60_000;

const REDACTED = '***';

function failure(error: string): McpTestResult {
  return { ok: false, error };
}

function secretValuesOf(ext: LoadedExtension): string[] {
  const lookup = envLookupFor(ext.slug);
  return Object.values(ext.config.env ?? {})
    .filter(isSecretRef)
    .map((ref) => lookup.secret(ref.secret))
    .filter((value): value is string => !!value);
}

function redact(text: string, secrets: string[]): string {
  return secrets.reduce((acc, secret) => acc.split(secret).join(REDACTED), text);
}

export async function testMcpConnection(ext: LoadedExtension): Promise<McpTestResult> {
  if (!ext.config.mcp) return failure('This extension has no MCP server to test.');
  if (!hasConsent(ext)) return failure('Allow the extension to run its program first.');

  const missing = listMissingSetup(ext);
  if (missing.length > 0) return failure(`Setup incomplete: ${missing.join(', ')}.`);

  const config = toResolvedConfig(ext);
  if (!config) return failure('Could not resolve the server configuration.');

  const [diagnostic] = await probeMcpServers([config], {
    connectTimeoutMs: TEST_CONNECT_TIMEOUT_MS,
    totalBudgetMs: TEST_CONNECT_TIMEOUT_MS * 2,
  });
  recordMcpStatus([diagnostic]);

  return diagnostic.ok
    ? { ok: true, toolCount: diagnostic.toolCount ?? 0 }
    : failure(redact(diagnostic.error ?? 'Connection failed.', secretValuesOf(ext)));
}
