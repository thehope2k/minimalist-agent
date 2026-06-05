import { useState } from 'react';
import { Check, Copy, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { copyImageSrcToClipboard } from '@/lib/clipboard-image';

interface CopyImageButtonProps {
  /** Image source (data URL, blob URL, or remote URL). */
  src: string;
  className?: string;
}

/**
 * Copy-image counterpart to {@link CopyButton}. Re-encodes the image to PNG
 * and writes it to the clipboard, with a brief ✓ / ✗ confirmation.
 *
 * Hover-reveal behaviour matches CopyButton (`group-hover:opacity-100`);
 * pass `opacity-100` to keep it always visible in toolbars.
 */
export function CopyImageButton({ src, className }: CopyImageButtonProps) {
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
          await copyImageSrcToClipboard(src);
          setState('copied');
        } catch {
          setState('error');
        }
        setTimeout(() => setState('idle'), 1200);
      }}
    >
      {state === 'copied' ? (
        <Check className="h-3 w-3" />
      ) : state === 'error' ? (
        <X className="h-3 w-3" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
      {state === 'copied' ? 'Copied' : state === 'error' ? 'Failed' : 'Copy image'}
    </button>
  );
}
