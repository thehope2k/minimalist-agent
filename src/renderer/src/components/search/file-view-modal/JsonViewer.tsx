import { useMemo } from 'react';
import JsonView from '@uiw/react-json-view';
import { vscodeTheme } from '@uiw/react-json-view/vscode';
import { CodeViewer } from './CodeViewer';

const JSON_THEME = {
  ...vscodeTheme,
  '--w-rjv-font-family':
    '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace',
  '--w-rjv-font-size': '13px',
  '--w-rjv-background-color': 'transparent',
  '--w-rjv-line-height': '1.7',
} as const;

export function JsonViewer({ raw }: { raw: string }) {
  const parsed = useMemo(() => {
    try {
      return JSON.parse(raw) as object;
    } catch {
      return null;
    }
  }, [raw]);

  // Invalid JSON → fall back to Monaco
  if (parsed === null) {
    return <CodeViewer content={raw} language="json" lineNumber={1} />;
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 scroll-thin">
      <JsonView
        value={parsed}
        style={JSON_THEME}
        collapsed={2}
        enableClipboard
        displayDataTypes={false}
        shortenTextAfterLength={200}
      />
    </div>
  );
}
