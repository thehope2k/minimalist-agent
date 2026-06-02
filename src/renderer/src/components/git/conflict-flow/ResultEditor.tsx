import { lazy, Suspense } from 'react';
import type { OnMount } from '@monaco-editor/react';
import { Loader2 } from 'lucide-react';
import { RESULT_OPTIONS } from './types';

const Editor = lazy(() =>
  import('@monaco-editor/react').then((m) => ({ default: m.Editor })),
);

type Props = {
  value: string;
  onChange: (value: string | undefined) => void;
  onMount: OnMount;
};

export function ResultEditor({ value, onChange, onMount }: Props) {
  return (
    <Suspense
      fallback={
        <div className="grid h-full place-items-center bg-app text-fg-muted">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      }
    >
      <Editor
        language="text"
        value={value}
        theme="appTheme"
        options={RESULT_OPTIONS}
        onChange={onChange}
        onMount={onMount}
      />
    </Suspense>
  );
}
