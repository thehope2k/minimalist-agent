import { forwardRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FIELD_CHROME } from './Input';

type PasswordInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  /** Use a monospace font — on by default since this holds keys/tokens. */
  mono?: boolean;
};

/**
 * Single-line secret input with a show/hide toggle. Defaults to monospace
 * because it almost always holds an API key or token.
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, mono = true, disabled, ...rest }, ref) => {
    const [visible, setVisible] = useState(false);
    const Icon = visible ? EyeOff : Eye;
    return (
      <div className="relative">
        <input
          ref={ref}
          type={visible ? 'text' : 'password'}
          disabled={disabled}
          className={cn(FIELD_CHROME, 'pr-9', mono && 'font-mono', className)}
          {...rest}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setVisible((v) => !v)}
          disabled={disabled}
          aria-label={visible ? 'Hide value' : 'Show value'}
          className="absolute inset-y-0 right-0 grid w-9 place-items-center text-fg-subtle transition-colors hover:text-fg-muted disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Icon className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </div>
    );
  },
);
PasswordInput.displayName = 'PasswordInput';
