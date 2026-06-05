import type { ConnectionMeta } from '@/lib/electron';
import { getPreset } from '@/lib/openai-compatible-presets';

export function providerLabel(conn: ConnectionMeta): string {
  if (conn.providerType === 'local') return 'Local (Ollama)';
  if (conn.providerType === 'openai-compatible') {
    return getPreset(conn.presetId)?.name ?? 'OpenAI-compatible';
  }
  if (conn.providerType === 'pi') {
    if (conn.piAuthProvider === 'github-copilot') return 'GitHub Copilot';
    if (conn.piAuthProvider === 'openai-codex') return 'ChatGPT Plus';
    return 'Pi';
  }
  return conn.authType === 'oauth' ? 'Claude OAuth' : 'Anthropic API';
}
