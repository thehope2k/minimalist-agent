import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

const FIELD_CHROME =
  'w-full rounded-md border border-border bg-elevated/40 px-2.5 py-2 text-sm text-fg outline-none placeholder:text-fg-subtle focus:border-border-strong disabled:cursor-not-allowed disabled:opacity-60';

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  /** Use a monospace font (e.g. for API keys, codes). */
  mono?: boolean;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, mono, type, ...rest }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(FIELD_CHROME, type === 'number' && 'number-input', mono && 'font-mono', className)}
      {...rest}
    />
  ),
);
Input.displayName = 'Input';

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  mono?: boolean;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, mono, ...rest }, ref) => (
    <textarea
      ref={ref}
      className={cn(FIELD_CHROME, 'resize-none', mono && 'font-mono', className)}
      {...rest}
    />
  ),
);
Textarea.displayName = 'Textarea';

export { FIELD_CHROME };
