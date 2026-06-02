interface HighlightedTextProps {
  text: string;
  query: string;
  className?: string;
}

/**
 * Highlights the first occurrence of query in text.
 */
export function HighlightedText({ text, query, className }: HighlightedTextProps) {
  if (!query.trim()) return <span className={className}>{text}</span>;

  const lower = text.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return <span className={className}>{text}</span>;

  return (
    <span className={className}>
      {text.slice(0, idx)}
      <mark className="bg-transparent font-semibold text-accent">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </span>
  );
}
