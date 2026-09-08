import type { ILink, ILinkProvider, Terminal as XTerminal } from '@xterm/xterm';

// Requires a file extension so we don't light up on things like `localhost:3000`
// or `Host:8080` that merely contain a colon-number pair.
const PATH_LINE_RE =
  /((?:\.{1,2}\/|\/|[a-zA-Z]:[\\/])?[\w.-]+(?:[\\/][\w.-]+)*\.\w+):(\d+)(?::(\d+))?/;

/**
 * Resolve a path matched in terminal output against the tab's cwd.
 *
 * Best-effort: the cwd is the one the tab was launched with, not the shell's
 * live working directory (which we don't track across `cd`), so a resolved
 * path can point at a file that no longer exists there — the file viewer
 * already renders that as a normal not-found error rather than crashing.
 */
export function resolveTerminalPath(cwd: string, rawPath: string): string {
  if (/^[a-zA-Z]:[\\/]/.test(rawPath) || rawPath.startsWith('/')) return rawPath;
  const isWindowsStyle = /^[a-zA-Z]:[\\/]/.test(cwd);
  const sep = isWindowsStyle ? '\\' : '/';
  const stack = cwd.split(/[\\/]/).filter(Boolean);
  for (const segment of rawPath.split(/[\\/]/)) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') stack.pop();
    else stack.push(segment);
  }
  return (!isWindowsStyle && cwd.startsWith('/') ? '/' : '') + stack.join(sep);
}

export interface PathLinkProviderOptions {
  /** Read live via a getter so a stale closure never outlives a cwd change. */
  getCwd:     () => string;
  onOpenPath: (absolutePath: string, lineNumber: number) => void;
}

/**
 * Makes `file/path.ts:12:5`-style tokens in terminal output (stack traces,
 * lint/test failures) clickable, opening the file in the app's own viewer
 * at that line — the same affordance `WebLinksAddon` gives plain URLs.
 */
export function createPathLinkProvider(
  term: XTerminal,
  { getCwd, onOpenPath }: PathLinkProviderOptions,
): ILinkProvider {
  return {
    provideLinks(bufferLineNumber, callback) {
      const line = term.buffer.active.getLine(bufferLineNumber - 1);
      if (!line) {
        callback(undefined);
        return;
      }

      const text = line.translateToString(true);
      const re = new RegExp(PATH_LINE_RE.source, 'g');
      const links: ILink[] = [];
      let match: RegExpExecArray | null;

      while ((match = re.exec(text))) {
        const [full, rawPath, lineStr] = match;
        const lineNumber = parseInt(lineStr, 10);
        links.push({
          text: full,
          range: {
            start: { x: match.index + 1, y: bufferLineNumber },
            end:   { x: match.index + full.length, y: bufferLineNumber },
          },
          activate: () => onOpenPath(resolveTerminalPath(getCwd(), rawPath), lineNumber),
        });
      }

      callback(links.length ? links : undefined);
    },
  };
}
