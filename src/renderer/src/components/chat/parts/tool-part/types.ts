import type { MessagePart, SubagentTranscript } from '@/lib/chat';

export interface ToolPartProps {
  name: string;
  input?: unknown;
  partialInputJson?: string;
  result?: { content: string; isError?: boolean };
  status: 'running' | 'done' | 'error';
  subagent?: SubagentTranscript;
}

export const RESULT_PREVIEW_LIMIT = 4096;

/** Tools whose result body is meaningfully markdown — render it rich. */
export const MARKDOWN_RESULT_TOOLS = new Set(['task', 'agent']);
