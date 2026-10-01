// Adapts this app's resolved MCP server configs (extensions/mcp-config.ts,
// crossed into the subprocess as MsgInit.mcpServers) into the LoadedMcpConfig
// shape pi's native createMcpExtension() expects from its `loadConfig` hook.
import type { LoadedMcpConfig, McpServerEntry } from '@earendil-works/pi-coding-agent';
import type { McpServerConfig } from '../agent-runtime/pi/protocol';
import { createLogger } from '../../shared/sub-logger';

const log = createLogger('mcp');

// `exposure` defaults to `'direct'` here, not pi's own default `'codemode'`,
// which would silently remove every migrated tool from the model's direct
// tool declarations since this app doesn't use codemode.
export function buildLoadedMcpConfig(configs: McpServerConfig[] | undefined): LoadedMcpConfig {
  const servers: McpServerEntry[] = [];
  const errors: string[] = [];

  for (const cfg of configs ?? []) {
    if (cfg.transport === 'sse') {
      // pi's native MCP integration has no sse transport (Streamable HTTP
      // superseded it); connecting as http against an sse-only endpoint
      // would misbehave rather than fail clearly, so report and skip.
      const message = `MCP server "${cfg.slug}" uses the "sse" transport, which pi's native MCP integration does not support (only stdio and Streamable HTTP). Skipped.`;
      errors.push(message);
      log.warn(message);
      continue;
    }

    const exposure = cfg.exposure ?? 'direct';
    const entry: McpServerEntry = {
      name: cfg.slug,
      source: `extension:${cfg.slug}`,
      scope: 'extension',
      config:
        cfg.transport === 'stdio'
          ? {
              type: 'stdio',
              command: cfg.command,
              args: cfg.args,
              env: cfg.env,
              description: cfg.description,
              exposure,
              toolExposure: cfg.toolExposure,
            }
          : {
              type: 'http',
              url: cfg.url,
              headers: cfg.headers,
              description: cfg.description,
              exposure,
              toolExposure: cfg.toolExposure,
              auth: cfg.auth,
            },
    };
    servers.push(entry);
  }

  return { servers, errors };
}
