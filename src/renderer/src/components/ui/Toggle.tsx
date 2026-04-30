import { cn } from '@/lib/utils';

type Props = {
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label?: string;
};

export function Toggle({ value, onChange, disabled, label }: Props) {
  return (
    <button
      role="switch"
      aria-checked={value}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!value)}
      className={cn(
        'relative h-5 w-9 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        value ? 'bg-accent' : 'bg-elevated-2',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 grid h-4 w-4 place-items-center rounded-full bg-white shadow transition-transform',
          value ? 'translate-x-4' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}
