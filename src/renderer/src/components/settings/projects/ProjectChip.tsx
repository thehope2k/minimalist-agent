type Props = {
  prefix: string;
  label: string;
  muted?: boolean;
};

/**
 * Small chip component showing project settings (Mode, Autonomy, Connection, etc).
 */
export function ProjectChip({ prefix, label, muted }: Props) {
  return (
    <span className="inline-flex items-center overflow-hidden rounded-md border border-border-strong text-[10px] font-medium leading-none">
      <span className="bg-elevated px-1.5 py-1 text-fg-subtle">
        {prefix}
      </span>
      <span
        className={
          muted
            ? 'bg-elevated-2 px-1.5 py-1 italic text-fg-subtle'
            : 'bg-elevated-2 px-1.5 py-1 text-fg'
        }
      >
        {label}
      </span>
    </span>
  );
}
