export function EmptyState() {
  return (
    <div className="mx-auto flex h-full max-w-190 flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-elevated text-fg-muted">
        <span className="text-lg">◆</span>
      </div>
      <h1 className="text-lg font-medium text-fg">Start a new session</h1>
      <p className="mt-1 max-w-105 text-sm text-fg-muted">
        Type a message below. The session is created on your first send and saved to disk automatically.
      </p>
    </div>
  );
}
