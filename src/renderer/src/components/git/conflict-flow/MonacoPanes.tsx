import { lazy, Suspense } from 'react';
import type { DiffOnMount } from '@monaco-editor/react';
import { Loader2 } from 'lucide-react';
import { SHARED_OPTIONS } from './types';

const DiffEditor = lazy(() =>
  import('@monaco-editor/react').then((m) => ({ default: m.DiffEditor })),
);

type Props = {
  baseContent: string;
  oursContent: string;
  theirsContent: string;
  onMount: DiffOnMount;
};

export function MonacoPanes({ baseContent, oursContent, theirsContent, onMount }: Props) {
  return (
    <>
      {/* OURS (HEAD) vs BASE */}
      <Suspense
        fallback={
          <div className="grid h-full place-items-center bg-app text-fg-muted">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        }
      >
        <DiffEditor
          language="text"
          original={baseContent}
          modified={oursContent}
          theme="appTheme"
          options={SHARED_OPTIONS}
          onMount={onMount}
        />
      </Suspense>

      {/* THEIRS vs BASE */}
      <Suspense
        fallback={
          <div className="grid h-full place-items-center bg-app text-fg-muted">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        }
      >
        <DiffEditor
          language="text"
          original={baseContent}
          modified={theirsContent}
          theme="appTheme"
          options={SHARED_OPTIONS}
        />
      </Suspense>
    </>
  );
}
