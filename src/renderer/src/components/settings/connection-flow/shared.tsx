import { ArrowLeft, Monitor, Plug, Sparkles } from 'lucide-react';
import { IconButton } from '@/components/ui';
import type { ConnectionMeta } from '@/lib/electron';

export function FormShell({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="px-6 py-5">
      <div className="mb-4 flex items-center gap-2">
        <IconButton icon={ArrowLeft} label="Back" onClick={onBack} />
        <h3 className="text-sm font-medium text-fg">{title}</h3>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

export function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-red-500/40 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-300">
      {children}
    </p>
  );
}

export function Actions({ children }: { children: React.ReactNode }) {
  return <div className="mt-5 flex justify-end gap-2">{children}</div>;
}

/* Brand marks — specific to the connection picker */

export function AnthropicMark() {
  return (
    <span className="grid h-4 w-4 place-items-center rounded-sm bg-orange-500/20 text-orange-400">
      <Sparkles className="h-2.5 w-2.5" strokeWidth={2} />
    </span>
  );
}

export function OpenAIMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 text-fg-muted" fill="currentColor" aria-hidden>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 7l4 2.5v5L12 17l-4-2.5v-5L12 7z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export function GithubMark() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

/** Provider-aware icon for a connection — use anywhere a connection needs a logo. */
export function BrandMark({ conn }: { conn: Pick<ConnectionMeta, 'providerType' | 'piAuthProvider'> }) {
  if (conn.providerType === 'anthropic') return <AnthropicMark />;
  if (conn.providerType === 'pi' && conn.piAuthProvider === 'github-copilot') return <GithubMark />;
  if (conn.providerType === 'pi' && conn.piAuthProvider === 'openai-codex') return <OpenAIMark />;
  if (conn.providerType === 'local') {
    return <Monitor className="h-4 w-4 text-fg-muted" strokeWidth={1.75} />;
  }
  if (conn.providerType === 'openai-compatible') {
    return <Plug className="h-4 w-4 text-fg-muted" strokeWidth={1.75} />;
  }
  return <span className="grid h-4 w-4 place-items-center text-fg-subtle">·</span>;
}
