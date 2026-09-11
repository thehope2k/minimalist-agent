import type { ConnectionMeta } from '@/lib/electron';
import { getPreset } from '@/lib/openai-compatible-presets';

export function providerLabel(conn: ConnectionMeta): string {
  if (conn.providerType === 'local') return 'Local (Ollama)';
  if (conn.providerType === 'openai-compatible') {
    return getPreset(conn.presetId)?.name ?? 'OpenAI-compatible';
  }
  if (conn.providerType === 'codemie-sso') return 'CodeMie SSO';
  if (conn.providerType === 'github-copilot') return 'GitHub Copilot';
  if (conn.providerType === 'openai-codex') return 'ChatGPT';
  return 'Unknown';
}
