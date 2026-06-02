import { useEffect } from 'react';

interface ImageLightboxProps {
  src: string;
  name: string;
  onClose: () => void;
  onReveal: () => void;
}

/**
 * Full-screen image lightbox with reveal-in-Finder button.
 */
export function ImageLightbox({ src, name, onClose, onReveal }: ImageLightboxProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={name}
      onClick={onClose}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/85 p-8"
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onReveal();
        }}
        className="max-w-full truncate text-xs text-white/70 transition-colors hover:text-white"
        title="Show in Finder"
      >
        {name}
      </button>
      {src ? (
        <img
          src={src}
          alt={name}
          onClick={(e) => e.stopPropagation()}
          className="max-h-[88vh] max-w-[92vw] rounded-md object-contain shadow-2xl"
        />
      ) : (
        <div className="text-sm text-white/60">Loading…</div>
      )}
      <div className="text-[11px] text-white/40">
        Press Esc or click outside to close
      </div>
    </div>
  );
}
