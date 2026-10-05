import { Plus } from 'lucide-react';

export function NewAssetButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-md border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[11px] font-medium text-accent hover:bg-accent/20"
      title={label}
    >
      <Plus className="h-3 w-3" strokeWidth={2.5} />
      New
    </button>
  );
}
