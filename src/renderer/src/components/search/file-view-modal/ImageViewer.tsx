import { ZoomPan } from '@/components/ui';

export function ImageViewer({
  src,
  filename,
}: {
  src: string;
  filename: string;
}) {
  return (
    <ZoomPan className="flex-1 min-h-0 bg-[#111116]" fitOnMount>
      <img src={src} alt={filename} draggable={false} className="max-w-none" />
    </ZoomPan>
  );
}
