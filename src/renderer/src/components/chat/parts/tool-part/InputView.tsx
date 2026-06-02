/**
 * Smart input renderer. For plain objects, render each top-level key as
 * a labelled row — short scalars inline, multi-line strings as their own
 * preformatted block. Avoids the `\n`-escape soup of raw JSON pretty-print
 * for tools like Task whose `prompt` field is paragraphs of text.
 *
 * Falls back to JSON pretty-print for non-object inputs.
 */

function CodeFrame({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <div className="mb-1 text-xs uppercase tracking-wide text-fg-subtle">
        {label}
      </div>
      <pre className="scroll-thin overflow-x-auto whitespace-pre-wrap break-words rounded bg-panel px-2 py-1.5 font-mono text-xs leading-relaxed text-fg">
        {text}
      </pre>
    </div>
  );
}

function InputField({ field, value }: { field: string; value: unknown }) {
  const isMultilineString =
    typeof value === 'string' && (value.includes('\n') || value.length > 80);
  const isObjectish = value !== null && typeof value === 'object';

  if (isMultilineString) {
    return (
      <div>
        <dt className="font-mono text-[11px] text-fg-subtle">{field}</dt>
        <dd className="mt-0.5">
          <pre className="scroll-thin overflow-x-auto whitespace-pre-wrap break-words rounded bg-app/40 px-2 py-1.5 font-mono text-xs leading-relaxed text-fg">
            {value as string}
          </pre>
        </dd>
      </div>
    );
  }
  if (isObjectish) {
    let nested: string;
    try {
      nested = JSON.stringify(value, null, 2);
    } catch {
      nested = String(value);
    }
    return (
      <div>
        <dt className="font-mono text-[11px] text-fg-subtle">{field}</dt>
        <dd className="mt-0.5">
          <pre className="scroll-thin overflow-x-auto whitespace-pre-wrap break-words rounded bg-app/40 px-2 py-1.5 font-mono text-xs leading-relaxed text-fg">
            {nested}
          </pre>
        </dd>
      </div>
    );
  }
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 font-mono text-[11px] text-fg-subtle">
        {field}
      </dt>
      <dd className="min-w-0 flex-1 break-words font-mono text-xs text-fg">
        {value === null || value === undefined
          ? String(value)
          : typeof value === 'string'
            ? value
            : JSON.stringify(value)}
      </dd>
    </div>
  );
}

type Props = {
  input: unknown;
};

export function InputView({ input }: Props) {
  if (
    typeof input !== 'object' ||
    input === null ||
    Array.isArray(input)
  ) {
    let text: string;
    try {
      text = JSON.stringify(input, null, 2);
    } catch {
      text = String(input);
    }
    return <CodeFrame label="Input" text={text} />;
  }
  const entries = Object.entries(input as Record<string, unknown>);
  return (
    <div>
      <div className="mb-1 text-xs uppercase tracking-wide text-fg-subtle">
        Input
      </div>
      <dl className="space-y-1.5 rounded bg-panel px-2 py-1.5">
        {entries.map(([key, value]) => (
          <InputField key={key} field={key} value={value} />
        ))}
      </dl>
    </div>
  );
}
