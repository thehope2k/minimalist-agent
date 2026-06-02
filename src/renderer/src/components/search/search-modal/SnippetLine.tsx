interface SnippetLineProps {
  lineContent: string;
  matchStart: number;
  matchEnd: number;
}

/**
 * Renders a grep match line with the match region highlighted.
 */
export function SnippetLine({ lineContent, matchStart, matchEnd }: SnippetLineProps) {
  const trimmed = lineContent.trimStart();
  const trimOffset = lineContent.length - trimmed.length;
  const start = Math.max(0, matchStart - trimOffset);
  const end = Math.max(0, matchEnd - trimOffset);

  if (start >= end || start >= trimmed.length) {
    return <>{trimmed}</>;
  }

  return (
    <>
      {trimmed.slice(0, start)}
      <mark className="bg-transparent font-semibold text-accent">
        {trimmed.slice(start, end)}
      </mark>
      {trimmed.slice(end)}
    </>
  );
}
