// JSONL wire format between the main-process chat runtime and the subprocess.
//
// One discriminated union per direction; each message is encoded as a
// single line of JSON on stdin/stdout.
//
// IMPORTANT: this file is imported by both the main process and the Pi
// subprocess entrypoint. It must remain dependency-free (no Electron,
// no Pi SDK imports — only types).

/* ============================================================ */
/*  Shared shapes                                                */
/* ============================================================ */

import type { ModelProvider } from '../../../../shared/provider-types';
export type { ModelProvider };

/** Credential shape handed to the subprocess via `init` / `token_update`. */
export type RuntimeCredential =
  | { type: 'oauth'; access: string; refresh: string; expires?: number }
  | { type: 'api_key'; key: string };

export interface RuntimeAuth {
  provider: ModelProvider;
  credential: RuntimeCredential;
}

/** Permission modes as the renderer expresses them. */
export type PermissionMode = 'plan' | 'auto';

export type ThinkingLevel = 'off' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/** How pi's native MCP integration exposes a server's tools to the model.
 * Mirror of `McpExposure` in extensions/types.ts — see that file. */
export type McpExposure = 'codemode' | 'deferred' | 'direct' | 'hidden';

/**
 * Fully-resolved MCP server config crossing main→subprocess. Mirror of
 * `ResolvedMcpServerConfig` in extensions/mcp-config.ts — duplicated here to
 * keep this file dependency-free (it's imported by both processes). Secrets
 * are already decrypted main-side, since the subprocess can't read the secret
 * store. `exposure` is unset here when the extension author didn't set one;
 * the subprocess applies its own default.
 */
export type McpServerConfig =
  | {
      slug: string;
      transport: 'stdio';
      command: string;
      args?: string[];
      env?: Record<string, string>;
      description?: string;
      exposure?: McpExposure;
      toolExposure?: Record<string, McpExposure>;
    }
  | {
      slug: string;
      transport: 'http' | 'sse';
      url: string;
      headers?: Record<string, string>;
      description?: string;
      exposure?: McpExposure;
      toolExposure?: Record<string, McpExposure>;
      auth?: { provider: string };
    };
