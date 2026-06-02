import type { ReactNode } from 'react';

type Props = {
  title: string;
  children: ReactNode;
  footer: ReactNode;
  onBackdropClick?: () => void;
  maxHeight?: boolean;
};

/**
 * Shared dialog layout: overlay + panel + header + scrollable body + footer.
 */
export function DialogLayout({ title, children, footer, onBackdropClick, maxHeight = false }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onBackdropClick}
      />
      
      <div className={`relative w-[min(640px,calc(100vw-32px))] ${maxHeight ? 'max-h-[85vh]' : ''} ${maxHeight ? 'flex flex-col' : ''} rounded-xl border border-border bg-panel shadow-2xl`}>
        <div className="shrink-0 border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold text-fg">{title}</h2>
        </div>

        <div className={`${maxHeight ? 'flex-1 overflow-y-auto scroll-thin' : ''} space-y-4 p-5`}>
          {children}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          {footer}
        </div>
      </div>
    </div>
  );
}
