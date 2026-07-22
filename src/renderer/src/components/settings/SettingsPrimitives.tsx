import { Toggle } from '@/components/ui';

export function SettingsSection({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8 first:mt-0">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-fg">{title}</h3>
          {subtitle && <p className="text-sm text-fg-subtle">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}

export function SettingsCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-panel">
      {children}
    </div>
  );
}

export function SettingsDivider() {
  return <div className="h-px bg-border" />;
}

export function SettingsRow({
  label,
  description,
  control,
}: {
  label: string;
  description?: string;
  control: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <div className="text-sm font-medium text-fg">{label}</div>
        {description && <div className="text-xs text-fg-subtle">{description}</div>}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

export function SettingsToggle({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <SettingsRow
      label={label}
      description={description}
      control={
        <Toggle value={checked} onChange={onCheckedChange} disabled={disabled} />
      }
    />
  );
}
