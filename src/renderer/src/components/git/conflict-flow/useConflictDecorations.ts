import { useEffect } from 'react';
import type * as MonacoType from 'monaco-editor';
import type { ConflictBlock } from '../conflict-parser';

/**
 * Applies decorations (highlighting) to conflict regions in the RESULT editor.
 */
export function useConflictDecorations(
  monaco: typeof MonacoType | null,
  editor: MonacoType.editor.IStandaloneCodeEditor | null,
  decorationCollection: MonacoType.editor.IEditorDecorationsCollection | null,
  conflictBlocks: ConflictBlock[],
) {
  useEffect(() => {
    if (!monaco || !editor || !decorationCollection) return;

    const model = editor.getModel();
    if (!model) return;

    const decos: MonacoType.editor.IModelDeltaDecoration[] = [];

    for (const block of conflictBlocks) {
      // <<<<<<< line
      decos.push({
        range: new monaco.Range(block.startLine, 1, block.startLine, 1),
        options: { isWholeLine: true, className: 'conflict-marker-line', zIndex: 1 },
      });
      
      // Ours section
      const oursEnd = block.baseLine > 0 ? block.baseLine - 1 : block.separatorLine - 1;
      if (oursEnd >= block.startLine + 1) {
        decos.push({
          range: new monaco.Range(block.startLine + 1, 1, oursEnd, 1),
          options: { isWholeLine: true, className: 'conflict-ours-line' },
        });
      }
      
      // ======= separator
      decos.push({
        range: new monaco.Range(block.separatorLine, 1, block.separatorLine, 1),
        options: { isWholeLine: true, className: 'conflict-marker-line', zIndex: 1 },
      });
      
      // Theirs section
      if (block.endLine > block.separatorLine + 1) {
        decos.push({
          range: new monaco.Range(block.separatorLine + 1, 1, block.endLine - 1, 1),
          options: { isWholeLine: true, className: 'conflict-theirs-line' },
        });
      }
      
      // >>>>>>> line
      decos.push({
        range: new monaco.Range(block.endLine, 1, block.endLine, 1),
        options: { isWholeLine: true, className: 'conflict-marker-line', zIndex: 1 },
      });
    }

    decorationCollection.set(decos);
  }, [monaco, editor, decorationCollection, conflictBlocks]);
}
