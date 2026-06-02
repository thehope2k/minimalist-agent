import { Loader2, FolderOpen } from 'lucide-react';

interface EmptyStatesProps {
  loading: boolean;
  error: string | null;
  hasItems: boolean;
  filterQuery: string;
  cwd: string | undefined;
}

export function EmptyStates({
  loading,
  error,
  hasItems,
  filterQuery,
  cwd,
}: EmptyStatesProps) {
  // No CWD set
  if (!cwd) {
    return (
      <div className="flex h-full flex-col bg-panel">
        <div className="flex h-10 shrink-0 items-center border-b border-border px-3">
          <FolderOpen className="mr-2 h-4 w-4 text-fg-muted" />
          <h2 className="text-sm font-medium text-fg">Files</h2>
        </div>
        <div className="flex flex-1 items-center justify-center p-6">
          <p className="text-center text-xs text-fg-subtle">
            No working directory set
            <br />
            <span className="text-fg-muted">
              Select a folder for this session
            </span>
          </p>
        </div>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center p-6">
        <Loader2 className="h-4 w-4 animate-spin text-fg-muted" />
        <span className="ml-2 text-xs text-fg-subtle">Loading...</span>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex items-center justify-center p-6">
        <p className="text-center text-xs text-red-400">{error}</p>
      </div>
    );
  }

  // Empty tree or no filter matches
  if (!hasItems) {
    return (
      <div className="flex items-center justify-center p-6">
        <p className="text-center text-xs text-fg-subtle">
          {filterQuery ? 'No files match filter' : '(empty directory)'}
        </p>
      </div>
    );
  }

  return null;
}
