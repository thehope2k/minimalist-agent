import { GitDiffModal } from '@/components/git/GitDiffModal';
import { SearchModal } from '@/components/search/SearchModal';
import { RecentFilesModal } from '@/components/search/RecentFilesModal';

type Props = {
  gitModalOpen: boolean;
  searchOpen: boolean;
  recentOpen: boolean;
  cwd: string | undefined;
  sessionConnectionSlug: string;
  sessionModel: string;
  activeSession: string | null;
  onCloseGit: () => void;
  onCloseSearch: () => void;
  onCloseRecent: () => void;
  onOpenFile?: (absolutePath: string, lineNumber: number) => void;
};

export function ChatModals({
  gitModalOpen,
  searchOpen,
  recentOpen,
  cwd,
  sessionConnectionSlug,
  sessionModel,
  activeSession,
  onCloseGit,
  onCloseSearch,
  onCloseRecent,
  onOpenFile,
}: Props) {
  return (
    <>
      {gitModalOpen && (
        <GitDiffModal
          cwd={cwd ?? null}
          connectionSlug={sessionConnectionSlug || undefined}
          model={sessionModel || undefined}
          sessionId={activeSession ?? undefined}
          onClose={onCloseGit}
        />
      )}

      {searchOpen && (
        <SearchModal
          cwd={cwd}
          onClose={onCloseSearch}
          onOpenFile={(absolutePath, lineNumber) => {
            onCloseSearch();
            onOpenFile?.(absolutePath, lineNumber);
          }}
        />
      )}

      {recentOpen && (
        <RecentFilesModal
          onClose={onCloseRecent}
          onOpenFile={(absolutePath, lineNumber) => {
            onCloseRecent();
            onOpenFile?.(absolutePath, lineNumber);
          }}
        />
      )}
    </>
  );
}
