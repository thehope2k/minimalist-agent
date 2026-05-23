import { forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { Tooltip } from './Tooltip';

type Size = 'sm' | 'md';

const SIZE_CLASS: Record<Size, string> = {
  sm: 'h-7 w-7',
  md: 'h-8 w-8',
};

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: React.ElementType;
  size?: Size;
  /** Tooltip text. Also used as aria-label. */
  label?: string;
  /** Extra className forwarded to the rendered icon element. */
  iconClassName?: string;
  /** Which side the tooltip appears on. Defaults to 'bottom'. */
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left';
};

const ButtonInner = forwardRef<HTMLButtonElement, Props>(
  ({ icon: Icon, size = 'sm', label, className, iconClassName, tooltipSide: _side, ...rest }, ref) => (
    <button
      ref={ref}
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
      <Icon className={cn('h-4 w-4', iconClassName)} strokeWidth={1.75} />
    </button>
  ),
);
ButtonInner.displayName = 'IconButtonInner';

export const IconButton = forwardRef<HTMLButtonElement, Props>(
  (props, ref) => {
    const { label, tooltipSide = 'bottom' } = props;
    if (!label) return <ButtonInner ref={ref} {...props} />;
    return (
      <Tooltip content={label} side={tooltipSide}>
        <ButtonInner ref={ref} {...props} />
      </Tooltip>
    );
  },
);
IconButton.displayName = 'IconButton';
