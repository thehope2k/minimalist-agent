export type McpStatus = {
  slug: string;
  ok: boolean;
  reason?:
    'disabled' | 'missing-secrets' | 'no-consent' | 'connect-failed' | 'unsupported-transport';
  toolCount?: number;
  error?: string;
};
