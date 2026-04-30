import { Plug } from 'lucide-react';
import { cn } from '@/lib/utils';
import { displayIcon } from '@/lib/extensions';
import type { LoadedExtension } from '@/lib/electron';

const SIZE_CLASSES = {
  sm: 'h-6 w-6 text-[12px]',
  md: 'h-8 w-8 text-sm',
  lg: 'h-10 w-10 text-base',
} as const;

const ICON_SIZE = { sm: 12, md: 14, lg: 18 } as const;

const EMOJI_RE = /^\p{Extended_Pictographic}/u;

export function ExtensionAvatar({
  extension,
  size = 'md',
  className,
}: {
  extension: LoadedExtension;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const dim = SIZE_CLASSES[size];

  if (extension.iconPath) {
    return (
      <img
        src={`file://${extension.iconPath}`}
        alt=""
        className={cn(
          'shrink-0 rounded-md object-cover',
          dim,
          className,
        )}
      />
    );
  }

  const icon = displayIcon(extension);
  if (icon && EMOJI_RE.test(icon)) {
    return (
      <span
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-md bg-elevated/60',
          dim,
          className,
        )}
        aria-hidden
      >
        {icon}
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md bg-accent/15 text-accent',
        dim,
        className,
      )}
      aria-hidden
    >
      <Plug size={ICON_SIZE[size]} strokeWidth={1.75} />
    </span>
  );
}
