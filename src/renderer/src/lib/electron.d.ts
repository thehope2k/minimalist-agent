// Renderer-facing types for the Electron preload bridge.
// The contract is shared with preload so IPC implementations stay type-checked.

export * from '../../../shared/electron-api';

import type { AppApi, AppEnv } from '../../../shared/electron-api';

declare global {
  interface Window {
    api: AppApi;
    env: AppEnv;
  }
}

export {};
