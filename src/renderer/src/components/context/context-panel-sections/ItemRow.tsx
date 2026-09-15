export function ItemRow({
  avatar,
  name,
  slug,
  description,
  badge,
  action,
  onOpen,
}: {
  avatar: React.ReactNode;
  name: string;
  slug?: string;
  description?: string;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  onOpen?: () => void;
}) {
  return (
    <div className="group flex items-center gap-2 px-3 py-1.5">
      <button
        type="button"
        onClick={onOpen}
        disabled={!onOpen}
        title={description}
        className="flex min-w-0 flex-1 items-center gap-2 rounded text-left hover:bg-elevated/60 disabled:cursor-default disabled:hover:bg-transparent cursor-pointer"
      >
        {avatar}
        <span className="min-w-0 flex-1 truncate text-sm text-fg">{name}</span>
        {badge}
        {slug && <span className="shrink-0 font-mono text-[10px] text-fg-subtle">@{slug}</span>}
      </button>
      {action}
    </div>
  );
}
