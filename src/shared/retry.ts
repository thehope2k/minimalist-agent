// Auto-retry tuning for transient provider errors. Electron-free: shared by the
// renderer (settings UI), main (chat-subprocess.ts), and the pi-server subprocess
// so every process clamps identically.

export interface RetryTuning {
  enabled?: boolean;
  maxRetries?: number;
}

export interface ResolvedRetrySettings {
  enabled: boolean;
  maxRetries: number;
}

export const DEFAULT_RETRY_ENABLED = true;
export const DEFAULT_RETRY_MAX_RETRIES = 3;
export const MAX_RETRY_ATTEMPTS = 10;

export function resolveRetrySettings(tuning: RetryTuning | undefined): ResolvedRetrySettings {
  const requested = tuning?.maxRetries ?? DEFAULT_RETRY_MAX_RETRIES;
  return {
    enabled: tuning?.enabled ?? DEFAULT_RETRY_ENABLED,
    maxRetries: Math.min(Math.max(Math.round(requested), 0), MAX_RETRY_ATTEMPTS),
  };
}
