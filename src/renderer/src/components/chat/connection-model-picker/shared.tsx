// Shared helpers for the connection/model picker popover: provider
// categorization + the small brand-mark icon renderer used by both the
// top-level connection list and (indirectly) the picker trigger button.
import { BrandMark as ConnectionBrandMark } from '../../settings/connection-flow/shared';
import type { ConnectionMeta } from '@/lib/electron';

export type ProviderCategory = 'anthropic' | 'copilot' | 'chatgpt' | 'local' | 'openai-compatible' | 'codemie-sso' | 'other';

export function categorize(conn: ConnectionMeta): ProviderCategory {
  if (conn.providerType === 'pi' && conn.piAuthProvider === 'github-copilot') return 'copilot';
  if (conn.providerType === 'pi' && conn.piAuthProvider === 'openai-codex') return 'chatgpt';
  if (conn.providerType === 'local') return 'local';
  if (conn.providerType === 'openai-compatible') return 'openai-compatible';
  if (conn.providerType === 'codemie-sso') return 'codemie-sso';
  if (conn.providerType === 'anthropic') return 'anthropic';
  return 'other';
}

export function categoryHeader(c: ProviderCategory): string {
  switch (c) {
    case 'anthropic': return 'Anthropic';
    case 'copilot':   return 'GitHub Copilot';
    case 'chatgpt':   return 'ChatGPT';
    case 'local':     return 'Local';
    case 'openai-compatible': return 'OpenAI-compatible';
    case 'codemie-sso': return 'CodeMie SSO';
    default:          return 'Other';
  }
}

// `category` only drives the group header; the icon always comes from the
// connection's own provider fields (single source of truth — see
// connection-flow/shared.tsx). `conn` is optional only for the brief window
// where no connection matches `activeSlug` yet.
export function BrandMark({ conn }: { category?: ProviderCategory; conn?: ConnectionMeta }) {
  if (conn) return <ConnectionBrandMark conn={conn} />;
  return <span className="grid h-4 w-4 place-items-center text-fg-subtle">·</span>;
}
