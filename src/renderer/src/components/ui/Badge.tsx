import { cn } from '@/lib/utils';

type Variant = 'default' | 'soon' | 'accent';

const VARIANT_CLASS: Record<Variant, string> = {
  default: 'border-border text-fg-muted',
  soon: 'border-border text-fg-subtle',
  accent: 'border-accent/40 bg-accent/10 text-accent',
};

export function Badge({
  children,
  variant = 'default',
  className,
}: {
  children: React.ReactNode;
  variant?: Variant;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'rounded-sm border px-1 text-[10px] uppercase tracking-wider',
        VARIANT_CLASS[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
