import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { setContextFileNames } from '@/lib/connections';
import { Input } from '@/components/ui';

const DEFAULT_NAMES = ['agents.md', 'claude.md', 'copilot-instructions.md'];

export function ContextFileNamesRow({ current }: { current?: string[] }) {
  const names = current ?? DEFAULT_NAMES;
  const [input, setInput] = useState('');

  const add = () => {
    const trimmed = input.trim().toLowerCase();
    if (!trimmed || names.includes(trimmed)) { setInput(''); return; }
    void setContextFileNames([...names, trimmed]);
    setInput('');
  };

  const remove = (name: string) => void setContextFileNames(names.filter((n) => n !== name));

  return (
    <div className="px-4 py-3">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-sm text-fg">Context file names</span>
      </div>
      <p className="mb-3 text-xs text-fg-subtle">
        Filenames MA scans for project context each turn (case-insensitive, any directory depth).
        Add your team's convention: <code className="text-fg-muted">copilot-instructions.md</code>,
        <code className="text-fg-muted"> .cursorrules</code>, etc.
      </p>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {names.map((name) => (
          <span key={name} className="flex items-center gap-1 rounded-md border border-border bg-elevated px-2 py-0.5 text-xs text-fg">
            {name}
            {!DEFAULT_NAMES.includes(name) && (
              <button
                type="button"
                onClick={() => remove(name)}
                className="text-fg-subtle hover:text-fg transition-colors"
                aria-label={`Remove ${name}`}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
          placeholder="e.g. copilot-instructions.md"
          className="flex-1 text-xs"
        />
        <button
          type="button"
          onClick={add}
          disabled={!input.trim()}
          className="flex items-center gap-1 rounded-md border border-border bg-elevated px-2.5 py-1.5 text-xs text-fg-muted hover:text-fg disabled:opacity-40 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>
    </div>
  );
}
