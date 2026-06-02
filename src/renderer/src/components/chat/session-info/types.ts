import type { ChatMessage } from '@/lib/chat';

export interface SessionInfoButtonProps {
  sessionId: string | null;
  /** Current title (read from session meta upstream). */
  title: string;
  /** Current conversation — used for the session-usage row. */
  messages: ChatMessage[];
}

/** Per-level horizontal indent. */
export const INDENT_PX = 16;

/** Guide-line offset within an indent level, aligned roughly under the
 *  parent chevron-tip so the line appears to "drop" from the folder icon. */
export const GUIDE_OFFSET_PX = 12;

/** File extensions that can be previewed as code. */
export const CODE_EXTS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'h',
  'json', 'yaml', 'yml', 'toml', 'sh', 'bash', 'zsh', 'sql', 'html',
  'css', 'scss', 'md', 'txt', 'log', 'conf', 'ini', 'cfg', 'env',
]);

export const PDF_EXTS = new Set(['pdf']);
export const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']);
