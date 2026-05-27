import type { PermissionMode as SdkPermissionMode } from '@anthropic-ai/claude-agent-sdk';
import type { PermissionMode } from '../storage/settings';

export type { PermissionMode };

/* ---- mode mapping ---------------------------------------------- */

export function toSdkPermissionMode(mode: PermissionMode): SdkPermissionMode {
  switch (mode) {
    case 'plan':
      return 'plan';
    case 'auto':
    default:
      // Use 'default' not 'bypassPermissions' so SDK respects canUseTool
      return 'default';
  }
}