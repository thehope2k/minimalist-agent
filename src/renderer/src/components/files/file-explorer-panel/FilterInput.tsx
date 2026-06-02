import { Search, X } from 'lucide-react';

interface FilterInputProps {
  value: string;
  onChange: (value: string) => void;
  inputRef: React.RefObject<HTMLInputElement>;
}

export function FilterInput({ value, onChange, inputRef }: FilterInputProps) {
  return (
    <div className="shrink-0 border-b border-border p-2">
      <div className="flex items-center gap-1.5 rounded border border-border bg-elevated px-2 py-1">
        <Search className="h-3.5 w-3.5 shrink-0 text-fg-muted" />
        <input
          ref={inputRef}
          type="text"
          placeholder="Filter files..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
        />
        {value && (
          <button
            onClick={() => onChange('')}
            className="shrink-0 rounded p-0.5 text-fg-subtle hover:bg-panel hover:text-fg"
            aria-label="Clear filter"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}
