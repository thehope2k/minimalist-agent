import { Toggle } from '@/components/ui';

interface Props {
  mode: 'auto' | 'off';
  isStreaming?: boolean;
  onModeChange: (mode: 'auto' | 'off') => void;
}

export function SddModeToggle({ mode, isStreaming, onModeChange }: Props) {
  const handleChange = (enabled: boolean) => {
    const next: 'auto' | 'off' = enabled ? 'auto' : 'off';
    // Persistence is handled by the onModeChange caller (ChatArea).
    onModeChange(next);
  };

  return (
    <div className="flex items-center gap-1.5" title={isStreaming ? 'Active next turn' : undefined}>
      <span className="text-xs text-fg-subtle">SDD</span>
      <Toggle
        value={mode === 'auto'}
        onChange={handleChange}
        label="SDD mode"
      />
    </div>
  );
}
