import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

type Size = 'sm' | 'md';

const SIZE_CLASS: Record<Size, string> = {
  sm: 'h-7 w-7',
  md: 'h-8 w-8',
};

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: React.ElementType;
  size?: Size;
  /** Optional tooltip via the native title attribute. */
  label?: string;
};

export const IconButton = forwardRef<HTMLButtonElement, Props>(
  ({ icon: Icon, size = 'sm', label, className, ...rest }, ref) => (
    <button
      ref={ref}
      title={label}
      aria-label={label}
      className={cn(
        'grid place-items-center rounded-md text-fg-muted transition-colors',
        'hover:bg-elevated hover:text-fg',
        'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-fg-muted',
        SIZE_CLASS[size],
        className,
      )}
      {...rest}
    >
      <Icon className="h-4 w-4" strokeWidth={1.75} />
    </button>
  ),
);
IconButton.displayName = 'IconButton';
