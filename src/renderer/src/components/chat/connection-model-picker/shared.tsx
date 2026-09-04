// Shared helpers for the connection/model picker popover: provider
// categorization + the small brand-mark icon renderer used by both the
// top-level connection list and (indirectly) the picker trigger button.
import { Monitor, Plug } from 'lucide-react';
import {
  AnthropicMark,
  BrandMark as ConnectionBrandMark,
  GithubMark,
  OpenAIMark,
} from '../../settings/connection-flow/shared';
import type { ConnectionMeta } from '@/lib/electron';

export type ProviderCategory = 'anthropic' | 'copilot' | 'chatgpt' | 'local' | 'openai-compatible' | 'other';

export function categorize(conn: ConnectionMeta): ProviderCategory {
  if (conn.providerType === 'pi' && conn.piAuthProvider === 'github-copilot') return 'copilot';
  if (conn.providerType === 'pi' && conn.piAuthProvider === 'openai-codex') return 'chatgpt';
  if (conn.providerType === 'local') return 'local';
  if (conn.providerType === 'openai-compatible') return 'openai-compatible';
  if (conn.providerType === 'anthropic') return 'anthropic';
  return 'other';
}

export function categoryHeader(c: ProviderCategory): string {
  switch (c) {
    case 'anthropic': return 'Anthropic';
    case 'copilot':   return 'GitHub Copilot';
    case 'chatgpt':   return 'ChatGPT Plus';
    case 'local':     return 'Local';
    case 'openai-compatible': return 'OpenAI-compatible';
    default:          return 'Other';
  }
}

export function BrandMark({ category, conn }: { category: ProviderCategory; conn?: ConnectionMeta }) {
  if (conn) return <ConnectionBrandMark conn={conn} />;
  if (category === 'anthropic') return <AnthropicMark />;
  if (category === 'copilot')   return <GithubMark />;
  if (category === 'chatgpt')   return <OpenAIMark />;
  if (category === 'local')     return <Monitor className="h-4 w-4 text-fg-muted" strokeWidth={1.75} />;
  if (category === 'openai-compatible') return <Plug className="h-4 w-4 text-fg-muted" strokeWidth={1.75} />;
  return <span className="grid h-4 w-4 place-items-center text-fg-subtle">·</span>;
}
