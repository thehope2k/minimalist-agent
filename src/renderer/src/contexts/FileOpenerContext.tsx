import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { openReference, revealInFinder, type ReferenceOutcome } from '@/lib/reference-resolver';

/**
 * Click-to-open support for file/directory references anywhere in the chat
 * tree (markdown links, tool-call chips) — mirrors CwdContext's "provide
 * once near the top, consume anywhere without prop drilling" pattern.
 */
interface FileOpenerContextValue {
  /** Resolve+open a raw path or `file://` URL; relative paths resolve against `cwd`. */
  openReference: (rawPathOrFileUrl: string, cwd?: string) => Promise<ReferenceOutcome>;
  /** Resolve+reveal in Finder/Explorer — stat-gated the same way as openReference, never a raw shell call. */
  revealInFinder: (rawPathOrFileUrl: string, cwd?: string) => Promise<ReferenceOutcome>;
}

const FileOpenerContext = createContext<FileOpenerContextValue | undefined>(undefined);

interface FileOpenerProviderProps {
  /** Opens the in-app file viewer modal — undefined outside a session context. */
  onOpenFile?: (absolutePath: string, lineNumber: number) => void;
  children: ReactNode;
}

export function FileOpenerProvider({ onOpenFile, children }: FileOpenerProviderProps) {
  const value = useMemo<FileOpenerContextValue>(
    () => ({
      openReference: (rawPathOrFileUrl, cwd) =>
        openReference(rawPathOrFileUrl, cwd, {
          openFile: (absolutePath, lineNumber = 1) => onOpenFile?.(absolutePath, lineNumber),
          revealInFinder: (absolutePath) => void window.api.sessions.revealFile(absolutePath),
        }),
      revealInFinder: (rawPathOrFileUrl, cwd) =>
        revealInFinder(rawPathOrFileUrl, cwd, (absolutePath) =>
          void window.api.sessions.revealFile(absolutePath),
        ),
    }),
    [onOpenFile],
  );

  return (
    <FileOpenerContext.Provider value={value}>{children}</FileOpenerContext.Provider>
  );
}

/** Returns undefined outside a FileOpenerProvider (e.g. Settings/Skills panels). */
export function useFileOpener(): FileOpenerContextValue | undefined {
  return useContext(FileOpenerContext);
}
