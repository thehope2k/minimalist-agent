import { ArrowLeft, Github, Sparkles } from 'lucide-react';
import { IconButton } from '@/components/ui';

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
  return <Github className="h-4 w-4" strokeWidth={1.75} />;
}
