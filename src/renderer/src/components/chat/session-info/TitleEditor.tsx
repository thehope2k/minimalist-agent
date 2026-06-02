interface TitleEditorProps {
  draftTitle: string;
  onChangeTitle: (value: string) => void;
  onCommit: () => void;
  onReset: () => void;
}

export function TitleEditor({
  draftTitle,
  onChangeTitle,
  onCommit,
  onReset,
}: TitleEditorProps) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
        Title
      </label>
      <input
        value={draftTitle}
        onChange={(e) => onChangeTitle(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') onReset();
        }}
        className="w-full rounded-md border border-border bg-elevated/40 px-2.5 py-2 text-sm text-fg outline-none focus:border-border-strong"
      />
    </div>
  );
}
