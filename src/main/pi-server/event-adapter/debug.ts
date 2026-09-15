import type { AgentSessionEvent } from '@earendil-works/pi-coding-agent';

/** Set PI_DEBUG=1 in the environment to dump every Pi event to stderr.
 *  Useful when adapter output is empty and we need to see what Pi actually sent. */
const PI_DEBUG = process.env.PI_DEBUG === '1';

export function debug(event: AgentSessionEvent): void {
  if (!PI_DEBUG) return;
  try {
    const t = (event as { type?: string }).type;
    const sub = (event as { assistantMessageEvent?: { type?: string } }).assistantMessageEvent;
    const msg = (
      event as {
        message?: {
          role?: string;
          content?: unknown;
          stopReason?: string;
          errorMessage?: string;
          api?: string;
          provider?: string;
          model?: string;
          usage?: unknown;
        };
      }
    ).message;
    const role = msg?.role;
    const contentPreview =
      typeof msg?.content === 'string'
        ? msg.content.slice(0, 120)
        : Array.isArray(msg?.content)
          ? `[${msg.content.length} blocks: ${msg.content
              .map((b: unknown) => (b as { type?: string }).type ?? '?')
              .join(',')}]`
          : '';
    const extras: string[] = [];
    if (msg?.stopReason) extras.push(`stop=${msg.stopReason}`);
    if (msg?.errorMessage) extras.push(`err=${JSON.stringify(msg.errorMessage)}`);
    if (msg?.api) extras.push(`api=${msg.api}`);
    if (msg?.provider) extras.push(`provider=${msg.provider}`);
    if (msg?.model) extras.push(`model=${msg.model}`);
    process.stderr.write(
      `[pi-event] ${t}` +
        (sub ? ` sub=${sub.type}` : '') +
        (role ? ` role=${role}` : '') +
        (contentPreview ? ` content=${contentPreview}` : '') +
        (extras.length ? ' ' + extras.join(' ') : '') +
        '\n',
    );
    // For terminal events, also dump the full message payload — that's
    // where Copilot-specific failure details usually hide.
    if (t === 'message_end' || t === 'agent_end' || t === 'turn_end') {
      try {
        process.stderr.write(`[pi-event-detail] ${JSON.stringify(event).slice(0, 10000)}\n`);
      } catch {
        /* */
      }
    }
  } catch {
    /* never crash on debug */
  }
}
