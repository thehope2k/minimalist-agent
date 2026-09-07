import type { MessagePart } from '@/lib/chat';

type TextMessagePart = Extract<MessagePart, { kind: 'text' }>;

export type MessageBlock =
  | { kind: 'text'; key: string; part: TextMessagePart }
  | { kind: 'single'; key: string; part: MessagePart }
  | { kind: 'pack'; key: string; parts: MessagePart[] };

/**
 * Text parts are the model's own narration checkpoints — the moments it
 * chose to say something to the user. Everything between two of them
 * (thinking + tool calls) is mechanics, grouped into one "pack" so the
 * default view reads as a conversation instead of a tool-call log.
 */
export function groupMessageParts(parts: MessagePart[]): MessageBlock[] {
  const blocks: MessageBlock[] = [];
  let pending: MessagePart[] = [];

  const flushPack = () => {
    if (pending.length === 0) return;
    if (pending.length === 1) {
      blocks.push({ kind: 'single', key: `single:${blocks.length}`, part: pending[0] });
    } else {
      blocks.push({ kind: 'pack', key: `pack:${blocks.length}`, parts: pending });
    }
    pending = [];
  };

  for (const [i, part] of parts.entries()) {
    if (part.kind === 'text') {
      flushPack();
      blocks.push({ kind: 'text', key: `text:${i}`, part });
      continue;
    }
    pending.push(part);
  }
  flushPack();

  return blocks;
}
