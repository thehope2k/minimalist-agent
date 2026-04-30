// Plain text segment of an assistant message, rendered as markdown.
//
// The streaming cursor used to live here; it now lives in StreamStatus
// (a footer beneath the bubble) so we don't render two indicators at once.

import { Markdown } from './markdown/Markdown';

export function TextPart({ text }: { text: string }) {
  return (
    <div className="text-sm leading-relaxed text-fg">
      <Markdown text={text} />
    </div>
  );
}
