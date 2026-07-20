import { useState } from 'react';
import { Check, Copy, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createLogger } from '@/lib/logger';

const log = createLogger('copy-button');
const CONFIRMATION_DURATION_MS = 1200;

interface CopyButtonProps {
  text: string;
  className?: string;
}

/**
 * Hover-revealed copy button. Copies `text` to the clipboard and shows a
 * brief ✓ confirmation. Used in code blocks, Mermaid diagrams, etc.
 *
 * Visibility is driven by a `group-hover:opacity-100` class on the parent's
 * `group` container — callers are responsible for adding `group` to the
 * wrapping element if they want the hover-fade behaviour.
 */
export function CopyButton({ text, className }: CopyButtonProps) {
  const [state, setState] = useState<'idle' | 'copied' | 'error'>('idle');
  return (
    <button
      type="button"
      className={cn(
        'flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]',
        'text-fg-subtle opacity-0 transition-opacity hover:bg-elevated hover:text-fg group-hover:opacity-100',
        className,
      )}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setState('copied');
        } catch (err) {
          log.warn('clipboard write failed', err);
          setState('error');
        }
        setTimeout(() => setState('idle'), CONFIRMATION_DURATION_MS);
      }}
    >
      {state === 'copied' ? (
        <Check className="h-3 w-3" />
      ) : state === 'error' ? (
        <X className="h-3 w-3" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
      {state === 'copied' ? 'Copied' : state === 'error' ? 'Failed' : 'Copy'}
    </button>
  );
}
