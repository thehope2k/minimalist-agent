import { parseDiffInput } from './diff-utils';
import { canonicalToolName } from '@/lib/tool-summary';
import type { MessagePart } from '@/lib/chat';

type ToolMessagePart = Extract<MessagePart, { kind: 'tool' }>;

export interface PackSummary {
  /** e.g. "4 steps · 2 files" — the pack's collapsed rollup label. */
  label: string;
  errorCount: number;
  hasSubagent: boolean;
}

const EDIT_TOOL_NAMES = new Set(['edit', 'write']);

function isFailedCall(part: ToolMessagePart): boolean {
  return part.status === 'error' || part.result?.isError === true;
}

function countEditedFiles(toolParts: ToolMessagePart[]): number {
  const files = new Set<string>();
  for (const part of toolParts) {
    if (!EDIT_TOOL_NAMES.has(part.name.toLowerCase())) continue;
    if (part.status !== 'done' || part.result?.isError) continue;
    const parsed = parseDiffInput(part.name, part.input);
    if (parsed) files.add(parsed.filePath);
  }
  return files.size;
}

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

export function summarizePack(parts: MessagePart[]): PackSummary {
  const toolParts = parts.filter((p): p is ToolMessagePart => p.kind === 'tool');
  const editedFileCount = countEditedFiles(toolParts);
  const errorCount = toolParts.filter(isFailedCall).length;
  const hasSubagent = toolParts.some((p) => canonicalToolName(p.name) === 'Agent');

  // Only count actual actions as "steps" — a pack that's pure reasoning
  // (no tool calls between two narration checkpoints) reads as "Reasoning",
  // matching StreamStatus's own vocabulary for the same case, instead of
  // inflating the count with Thinking parts or misreporting "0 steps".
  const stepLabel = toolParts.length > 0 ? pluralize(toolParts.length, 'step') : 'Reasoning';
  const label = editedFileCount > 0 ? `${stepLabel} · ${pluralize(editedFileCount, 'file')}` : stepLabel;

  return { label, errorCount, hasSubagent };
}
