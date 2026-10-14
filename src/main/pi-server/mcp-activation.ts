import type { ExtensionAPI, InlineExtension } from '@earendil-works/pi-coding-agent';
import type { McpServerConfig } from '../agent-runtime/pi/protocol';
import { createLogger } from '../../shared/sub-logger';
import { buildLoadedMcpConfig } from './mcp-native-config';

const log = createLogger('mcp');

// A server activated mid-session skips the startup probe, so its tool count is unknown.
const ACTIVATED_SERVER_EXPOSURE = 'deferred';

let extensionApi: ExtensionAPI | undefined;

export function mcpActivationExtension(): InlineExtension {
  return {
    name: 'minimalist-agent-mcp-activation',
    hidden: true,
    factory: (pi) => {
      // The per-turn resourceLoader.reload() re-runs factories, but only the first instance stays bound to the session.
      extensionApi ??= pi;
    },
  };
}

export function activateMcpServers(configs: McpServerConfig[]): void {
  if (!extensionApi) throw new Error('MCP activation requested before the extension loaded');

  const { servers, errors } = buildLoadedMcpConfig(
    configs.map((cfg) => ({ ...cfg, exposure: cfg.exposure ?? ACTIVATED_SERVER_EXPOSURE })),
  );
  for (const error of errors) log.warn(error);
  for (const server of servers) extensionApi.registerMcpServer(server.name, server.config);
}
