/**
 * Smart input renderer. For plain objects, render each top-level key as
 * a labelled row — short scalars inline, multi-line strings as their own
 * preformatted block. Avoids the `\n`-escape soup of raw JSON pretty-print
 * for tools like Task whose `prompt` field is paragraphs of text.
 *
 * Falls back to JSON pretty-print for non-object inputs.
 */

import { CopyButton, FileRefMenu } from '@/components/ui';
import { useCwd } from '@/contexts/CwdContext';
import { useFileOpener } from '@/contexts/FileOpenerContext';
import { resolveAgainstCwd } from '@/lib/reference-resolver';
import { useTransientFeedback } from '@/hooks/useTransientFeedback';

/** Tool-input keys known to hold a file path — rendered as click-to-open. */
const PATH_FIELDS = new Set(['file_path', 'notebook_path', 'path']);

function CodeFrame({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs uppercase tracking-wide text-fg-subtle">
        <span>{label}</span>
        <CopyButton text={text} className="opacity-100" />
      </div>
      <pre className="scroll-thin overflow-x-auto whitespace-pre-wrap wrap-break-word rounded bg-panel px-2 py-1.5 font-mono text-xs leading-relaxed text-fg">
        {text}
      </pre>
    </div>
  );
}

function PathField({ field, value }: { field: string; value: string }) {
  const [feedback, flash] = useTransientFeedback();
  const cwd = useCwd();
  const fileOpener = useFileOpener();
  const absolutePath = resolveAgainstCwd(value, cwd);

  const handleOpen = () => {
    if (!fileOpener) return;
    void fileOpener.openReference(value, cwd).then((outcome) => {
      if (!outcome.ok) flash(outcome.reason);
    });
  };

  return (
    <div className="flex items-center gap-2">
      <dt className="shrink-0 font-mono text-[11px] text-fg-subtle">{field}</dt>
      <dd className="flex min-w-0 flex-1 items-center gap-1">
        <button
          type="button"
          onClick={handleOpen}
          disabled={!fileOpener}
          title={value}
          className="min-w-0 flex-1 truncate wrap-break-word text-left font-mono text-xs text-accent underline-offset-2 hover:underline disabled:cursor-text disabled:text-fg disabled:no-underline"
        >
          {value}
        </button>
        {fileOpener && <FileRefMenu absolutePath={absolutePath} />}
        {feedback && (
          <span role="status" className="shrink-0 text-[11px] text-fg-subtle">
            {feedback}
          </span>
        )}
      </dd>
    </div>
  );
}

function InputField({ field, value }: { field: string; value: unknown }) {
  if (PATH_FIELDS.has(field) && typeof value === 'string' && value) {
    return <PathField field={field} value={value} />;
  }

  const isMultilineString =
    typeof value === 'string' && (value.includes('\n') || value.length > 80);
  const isObjectish = value !== null && typeof value === 'object';

  if (isMultilineString) {
    return (
      <div>
        <dt className="flex items-center justify-between font-mono text-[11px] text-fg-subtle">
          <span>{field}</span>
          <CopyButton text={value as string} className="opacity-100" />
        </dt>
        <dd className="mt-0.5">
          <pre className="scroll-thin overflow-x-auto whitespace-pre-wrap wrap-break-word rounded bg-app/40 px-2 py-1.5 font-mono text-xs leading-relaxed text-fg">
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
        <dt className="flex items-center justify-between font-mono text-[11px] text-fg-subtle">
          <span>{field}</span>
          <CopyButton text={nested} className="opacity-100" />
        </dt>
        <dd className="mt-0.5">
          <pre className="scroll-thin overflow-x-auto whitespace-pre-wrap wrap-break-word rounded bg-app/40 px-2 py-1.5 font-mono text-xs leading-relaxed text-fg">
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
      <dd className="min-w-0 flex-1 wrap-break-word font-mono text-xs text-fg">
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
  let fullJson: string;
  try {
    fullJson = JSON.stringify(input, null, 2);
  } catch {
    fullJson = String(input);
  }
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs uppercase tracking-wide text-fg-subtle">
        <span>Input</span>
        <CopyButton text={fullJson} className="opacity-100" />
      </div>
      <dl className="space-y-1.5 rounded bg-panel px-2 py-1.5">
        {entries.map(([key, value]) => (
          <InputField key={key} field={key} value={value} />
        ))}
      </dl>
    </div>
  );
}
