import { FileText, ChevronRight } from 'lucide-react';

interface Props {
  hasConstitution: boolean;
  onOpen: () => void;
}

/** Clickable entity-level row for the project constitution. */
export function ConstitutionRow({ hasConstitution, onOpen }: Props) {
  return (
    <button
      onClick={onOpen}
      className="w-full text-left flex items-center gap-2 px-3 py-2 bg-elevated/40 hover:bg-elevated-2 transition-colors group"
    >
      <FileText
        size={12}
        className={hasConstitution ? 'text-accent shrink-0' : 'text-fg-subtle shrink-0'}
      />
      <span className="text-sm font-medium text-fg flex-1">Constitution</span>
      {!hasConstitution && (
        <span className="text-[10px] text-fg-subtle shrink-0 italic">not written</span>
      )}
      <ChevronRight size={12} className="text-fg-subtle shrink-0 group-hover:text-fg transition-colors" />
    </button>
  );
}
