export function StubPanel({ title }: { title: string }) {
  return (
    <div className="mx-auto max-w-[760px] px-8 py-12">
      <h2 className="text-xl font-semibold text-fg">{title}</h2>
      <p className="mt-2 text-sm text-fg-muted">
        Not implemented in this build. Wire it up when the feature lands.
      </p>
    </div>
  );
}
