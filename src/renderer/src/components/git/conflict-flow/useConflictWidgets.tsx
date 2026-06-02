import { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import type * as MonacoType from 'monaco-editor';
import { ConflictBlockWidget } from './ConflictBlockWidget';
import type { WidgetEntry } from './types';
import type { ConflictBlock } from '../conflict-parser';

/**
 * Manages Monaco contentWidgets for per-conflict accept buttons.
 * Creates, updates, and cleans up widgets as conflicts change.
 */
export function useConflictWidgets(
  editor: MonacoType.editor.IStandaloneCodeEditor | null,
  conflictBlocks: ConflictBlock[],
  onAccept: (block: ConflictBlock, side: 'ours' | 'theirs' | 'both', index: number) => void,
  onIgnore: (block: ConflictBlock, index: number) => void,
) {
  const widgetMapRef = useRef<Map<number, WidgetEntry>>(new Map());

  useEffect(() => {
    if (!editor) return;

    const nextKeys = new Set(conflictBlocks.map((_, i) => i));

    // Remove widgets for blocks that no longer exist
    for (const [key, entry] of widgetMapRef.current) {
      if (!nextKeys.has(key)) {
        editor.removeContentWidget(entry.widget);
        entry.root.unmount();
        widgetMapRef.current.delete(key);
      }
    }

    // Add / update widgets for current blocks
    for (let i = 0; i < conflictBlocks.length; i++) {
      const block = conflictBlocks[i];
      let entry = widgetMapRef.current.get(i);

      if (!entry) {
        // Create a new widget for this block
        const node = document.createElement('div');
        node.className =
          'flex items-center gap-1 rounded-b border border-t-0 border-border/60 bg-panel/95 backdrop-blur-sm';
        const root = createRoot(node);
        const lineRef = { current: block.startLine };

        const widget: MonacoType.editor.IContentWidget = {
          getId: () => `conflict-block-${i}`,
          getDomNode: () => node,
          getPosition: () => ({
            position: { lineNumber: lineRef.current, column: 1 },
            // ContentWidgetPositionPreference.ABOVE = 0
            preference: [0 as MonacoType.editor.ContentWidgetPositionPreference],
          }),
          allowEditorOverflow: false,
        };

        entry = { widget, root, lineRef };
        widgetMapRef.current.set(i, entry);
        editor.addContentWidget(widget);
      }

      // Always re-render with fresh handlers
      const capturedBlock = block;
      const capturedIndex = i;
      const capturedTotal = conflictBlocks.length;

      entry.lineRef.current = block.startLine;
      editor.layoutContentWidget(entry.widget);

      entry.root.render(
        <ConflictBlockWidget
          blockIndex={capturedIndex}
          totalBlocks={capturedTotal}
          onAcceptOurs={() => onAccept(capturedBlock, 'ours', capturedIndex)}
          onAcceptTheirs={() => onAccept(capturedBlock, 'theirs', capturedIndex)}
          onAcceptBoth={() => onAccept(capturedBlock, 'both', capturedIndex)}
          onIgnore={() => onIgnore(capturedBlock, capturedIndex)}
        />,
      );
    }

    // Cleanup on unmount
    return () => {
      for (const entry of widgetMapRef.current.values()) {
        editor.removeContentWidget(entry.widget);
        entry.root.unmount();
      }
      widgetMapRef.current.clear();
    };
  }, [editor, conflictBlocks, onAccept, onIgnore]);
}
