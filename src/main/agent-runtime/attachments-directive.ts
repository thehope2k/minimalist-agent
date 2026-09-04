// Per-turn "read these first" directive for attachments — same pattern as
// formatSkillDirective (skills/directive.ts). Attachments are never inlined
// or sent as native content blocks: the model reads them itself (Read for
// text/images, Bash for anything else) using the real stored path given here.
// This keeps every attachment type on one code path, including ones added
// after this file was written.

import type { AttachmentType, StoredAttachment } from '../storage/sessions';

// Every AttachmentType the harness's Read tool can open directly (per its own
// description: text files and images). Anything not in this set — currently
// 'pdf' and 'office' — needs Bash instead. Expressed as "what Read supports"
// rather than "which types don't" so a future binary attachment type gets the
// Bash note automatically, without anyone remembering to update this file.
const READ_TOOL_TYPES: ReadonlySet<AttachmentType> = new Set(['image', 'text', 'snippet']);

/**
 * Build the attachments directive for a turn. Empty string when there are
 * no attachments (fully gated — no always-on prompt cost).
 */
export function formatAttachmentsDirective(attachments?: StoredAttachment[]): string {
  if (!attachments?.length) return '';
  const lines = attachments.map((att) => {
    // No specific tool is assumed here since availability varies by machine.
    const note = READ_TOOL_TYPES.has(att.type)
      ? ''
      : ` — Read can't open this format; check what's available and use Bash to extract its content if you need it`;
    return `- ${att.storedPath} (attachment: ${att.name}, ${att.type})${note}`;
  });
  return `Read the following attachments before using them:\n${lines.join('\n')}`;
}
