import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'outline' | 'ghost' | 'link';
type Size = 'sm' | 'md';

const VARIANT_CLASS: Record<Variant, string> = {
  primary:
    'bg-accent text-accent-fg hover:bg-accent-hover disabled:bg-elevated disabled:text-fg-subtle',
  outline:
    'border border-border bg-transparent text-fg hover:bg-elevated disabled:opacity-50',
  ghost:
    'bg-transparent text-fg-muted hover:bg-elevated hover:text-fg disabled:opacity-50',
  link:
    'bg-transparent text-accent hover:underline disabled:opacity-50 px-0 py-0',
};

const SIZE_CLASS: Record<Size, string> = {
  sm: 'px-2 py-1 text-xs gap-1.5',
  md: 'px-3 py-1.5 text-sm gap-2',
};

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  icon?: React.ElementType;
  iconRight?: React.ElementType;
  loading?: boolean;
  fullWidth?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, Props>(
  (
    {
      variant = 'outline',
      size = 'md',
      icon: Icon,
      iconRight: IconRight,
      loading,
      fullWidth,
      disabled,
      className,
      children,
      ...rest
    },
    ref,
  ) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center rounded-md font-medium transition-colors disabled:cursor-not-allowed',
        variant !== 'link' && SIZE_CLASS[size],
        VARIANT_CLASS[variant],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} />
      ) : (
        Icon && <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
      )}
      {children}
      {IconRight && (
        <IconRight className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
      )}
    </button>
  ),
);
Button.displayName = 'Button';
