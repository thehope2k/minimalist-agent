// Wraps <img> tags in the markdown with a click-to-expand lightbox.
// Defined as a proper component so it can hold local state.

import { useState } from 'react';
import { ExpandModal, ZoomPan } from '@/components/ui';

export function InlineImage({ src, alt }: { src?: string; alt?: string }) {
  const [open, setOpen] = useState(false);
  if (!src) return null;
  return (
    <>
      <img
        src={src}
        alt={alt}
        className="my-2 max-w-full cursor-zoom-in rounded-md border border-border"
        onClick={() => setOpen(true)}
      />
      {open && (
        <ExpandModal title={alt || 'Image'} onClose={() => setOpen(false)}>
          <ZoomPan className="flex-1">
            <div className="flex items-center justify-center p-6">
              <img
                src={src}
                alt={alt}
                className="max-w-full rounded-md"
                style={{ maxHeight: 'calc(90vh - 80px)' }}
                draggable={false}
              />
            </div>
          </ZoomPan>
        </ExpandModal>
      )}
    </>
  );
}
