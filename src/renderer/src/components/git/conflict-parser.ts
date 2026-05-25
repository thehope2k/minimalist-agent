// Parses Git conflict markers from file content (standard 2-way and diff3 3-way).
//
// A standard conflict block:
//   <<<<<<< HEAD              ← startLine  (1-indexed)
//   <our changes>
//   =======                   ← separatorLine
//   <their changes>
//   >>>>>>> branch-name       ← endLine
//
// A diff3-style block adds a base section:
//   <<<<<<< HEAD
//   <our changes>
//   ||||||| base              ← baseLine (absent in 2-way)
//   <base content>
//   =======
//   <their changes>
//   >>>>>>> branch-name

export interface ConflictBlock {
  /** 1-indexed line of the <<<<<<< marker. */
  startLine: number;
  /** 1-indexed line of the ||||||| marker, or -1 when absent (2-way). */
  baseLine: number;
  /** 1-indexed line of the ======= separator. */
  separatorLine: number;
  /** 1-indexed line of the >>>>>>> marker. */
  endLine: number;
  oursContent: string;
  /** Empty string when no ||||||| block present. */
  baseContent: string;
  theirsContent: string;
}

/**
 * Parse all conflict blocks from `content`. Returns an array ordered by
 * position in the file (top → bottom). Safe to call on conflict-free content
 * (returns []).
 */
export function parseConflictBlocks(content: string): ConflictBlock[] {
  const lines = content.split('\n');
  const blocks: ConflictBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    if (!lines[i].startsWith('<<<<<<<')) {
      i++;
      continue;
    }

    const startLine = i + 1; // convert to 1-indexed
    const oursLines: string[] = [];
    const baseLines: string[] = [];
    const theirsLines: string[] = [];
    let baseLine = -1;
    let separatorLine = -1;
    let endLine = -1;
    let phase: 'ours' | 'base' | 'theirs' = 'ours';

    i++;
    while (i < lines.length) {
      const line = lines[i];
      if (line.startsWith('>>>>>>>')) {
        endLine = i + 1;
        i++;
        break;
      } else if (line.startsWith('=======') && line.trimEnd() === '=======') {
        separatorLine = i + 1;
        phase = 'theirs';
      } else if (line.startsWith('|||||||')) {
        baseLine = i + 1;
        phase = 'base';
      } else {
        if (phase === 'ours') oursLines.push(line);
        else if (phase === 'base') baseLines.push(line);
        else theirsLines.push(line);
      }
      i++;
    }

    // Only add well-formed blocks (must have ======= and >>>>>>>).
    if (endLine !== -1 && separatorLine !== -1) {
      blocks.push({
        startLine,
        baseLine,
        separatorLine,
        endLine,
        oursContent: oursLines.join('\n'),
        baseContent: baseLines.join('\n'),
        theirsContent: theirsLines.join('\n'),
      });
    }
  }

  return blocks;
}

/** Returns true when the content still contains unresolved conflict markers. */
export function hasConflictMarkers(content: string): boolean {
  return content.split('\n').some((l) => l.startsWith('<<<<<<<'));
}

/**
 * Replace a conflict block in `content` with the supplied `resolution`
 * string. The block's marker lines (<<<, |||||, =====, >>>>> ) are removed;
 * `resolution` replaces them. An empty resolution string means "delete the
 * entire block" (useful for the "Ignore — remove markers" action).
 */
export function resolveBlock(
  content: string,
  block: ConflictBlock,
  resolution: string,
): string {
  const lines = content.split('\n');
  const before = lines.slice(0, block.startLine - 1);
  const after = lines.slice(block.endLine);
  const resLines = resolution.length === 0 ? [] : resolution.split('\n');
  return [...before, ...resLines, ...after].join('\n');
}
