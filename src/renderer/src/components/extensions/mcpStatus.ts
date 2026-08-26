export type McpStatus = {
  slug: string;
  ok: boolean;
  reason?: 'disabled' | 'missing-secrets' | 'no-consent' | 'connect-failed';
  toolCount?: number;
  error?: string;
};
