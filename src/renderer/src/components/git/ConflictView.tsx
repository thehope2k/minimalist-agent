// 3-pane merge conflict resolution view (IntelliJ-style).
//
// Layout  (react-resizable-panels):
//   ┌──────────────────┬──────────────────┐
//   │  OURS  (HEAD)    │  THEIRS          │
//   │  Monaco DiffEd.  │  Monaco DiffEd.  │  ← base→ours / base→theirs
//   ├──────────────────┴──────────────────┤
//   │  RESULT  (editable Monaco Editor)   │
//   │  • conflict regions highlighted     │
//   │  • per-block accept widget above <<<│
//   └─────────────────────────────────────┘
//
// Per-conflict accept buttons are injected as Monaco contentWidgets
// positioned ABOVE each <<<<<<< line — exactly how VS Code's conflict
// resolution UI works internally. React renders ConflictBlockWidget into
// each widget's DOM node.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DiffOnMount, OnMount } from '@monaco-editor/react';
import type * as MonacoType from 'monaco-editor';
import { Loader2 } from 'lucide-react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { registerAppMonacoTheme } from '@/lib/monaco-setup';
import { parseConflictBlocks, hasConflictMarkers, resolveBlock } from './conflict-parser';
import { MonacoPanes } from './conflict-flow/MonacoPanes';
import { ResultEditor } from './conflict-flow/ResultEditor';
import { ConflictToolbar } from './conflict-flow/ConflictToolbar';
import { useConflictContent } from './conflict-flow/useConflictContent';
import { useConflictWidgets } from './conflict-flow/useConflictWidgets';
import { useConflictDecorations } from './conflict-flow/useConflictDecorations';
import type { ConflictViewProps } from './conflict-flow/types';

export function ConflictView({ file, onResolved }: ConflictViewProps) {
  const { content, loading, loadError } = useConflictContent(file);
  const [resultText, setResultText] = useState('');
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [focusedBlockIndex, setFocusedBlockIndex] = useState(0);

  const resultEditorRef = useRef<MonacoType.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof MonacoType | null>(null);
  const decoCollectionRef = useRef<MonacoType.editor.IEditorDecorationsCollection | null>(null);

  // Derive conflict blocks from current result text
  const conflictBlocks = parseConflictBlocks(resultText);
  const isResolved = !hasConflictMarkers(resultText);

  // Stable refs for Monaco commands
  const resultTextRef = useRef(resultText);
  const conflictBlocksRef = useRef(conflictBlocks);
  const focusedBlockIndexRef = useRef(focusedBlockIndex);
  resultTextRef.current = resultText;
  conflictBlocksRef.current = conflictBlocks;
  focusedBlockIndexRef.current = focusedBlockIndex;

  // Initialize result text when content loads
  useEffect(() => {
    if (content) {
      setResultText(content.working);
    }
  }, [content]);

  // Conflict decorations (highlighting)
  useConflictDecorations(
    monacoRef.current,
    resultEditorRef.current,
    decoCollectionRef.current,
    conflictBlocks,
  );

  // Accept conflict block resolution
  const handleAccept = useCallback(
    (block: typeof conflictBlocks[0], side: 'ours' | 'theirs' | 'both', index: number) => {
      let resolution: string;
      if (side === 'ours') {
        resolution = block.oursContent;
      } else if (side === 'theirs') {
        resolution = block.theirsContent;
      } else { // both
        resolution = block.oursContent + '\n' + block.theirsContent;
      }
      const resolved = resolveBlock(resultText, block, resolution);
      setResultText(resolved);
      // Adjust focus if we removed the last block
      if (index >= parseConflictBlocks(resolved).length && index > 0) {
        setFocusedBlockIndex(index - 1);
      }
    },
    [resultText],
  );

  // Ignore conflict block (just removes markers without choosing content)
  const handleIgnore = useCallback(
    (block: typeof conflictBlocks[0], index: number) => {
      // For ignore, we just remove the markers and keep all content
      let result = resultText;
      const lines = result.split('\n');
      // Remove <<<<<<, ======, >>>>>>lines
      lines.splice(block.endLine - 1, 1); // >>>>>>>  
      lines.splice(block.separatorLine - 1, 1); // =======
      if (block.baseLine > 0) {
        lines.splice(block.baseLine - 1, 1); // ||||||| (if exists)
      }
      lines.splice(block.startLine - 1, 1); // <<<<<<<
      result = lines.join('\n');
      setResultText(result);
      if (index >= parseConflictBlocks(result).length && index > 0) {
        setFocusedBlockIndex(index - 1);
      }
    },
    [resultText],
  );

  // Navigation
  const handleNavigate = useCallback((targetIndex: number) => {
    const blocks = conflictBlocksRef.current;
    if (blocks.length === 0) return;
    const wrapped = ((targetIndex % blocks.length) + blocks.length) % blocks.length;
    setFocusedBlockIndex(wrapped);
    const editor = resultEditorRef.current;
    if (editor && blocks[wrapped]) {
      editor.revealLineInCenter(blocks[wrapped].startLine);
    }
  }, []);

  // Conflict widgets (accept buttons)
  useConflictWidgets(
    resultEditorRef.current,
    conflictBlocks,
    handleAccept,
    handleIgnore,
  );

  // Mark resolved
  const handleMarkResolved = async () => {
    if (!isResolved) return;
    setResolving(true);
    setResolveError(null);
    try {
      await window.api.git.resolveConflict({
        repoRoot: file.repoRoot,
        relativePath: file.relativePath,
        absolutePath: file.absolutePath,
        content: resultText,
      });
      onResolved();
    } catch (e) {
      setResolveError(e instanceof Error ? e.message : 'Failed to save file');
    } finally {
      setResolving(false);
    }
  };

  // Monaco mount handlers
  const onDiffMount: DiffOnMount = useCallback((editor) => {
    const monaco = (window as any).monaco;
    if (monaco && !monacoRef.current) {
      monacoRef.current = monaco;
      registerAppMonacoTheme(monaco);
    }
  }, []);

  const onResultMount: OnMount = useCallback((editor, monaco) => {
    resultEditorRef.current = editor;
    monacoRef.current = monaco;
    registerAppMonacoTheme(monaco);

    const model = editor.getModel();
    if (model) {
      decoCollectionRef.current = editor.createDecorationsCollection();
    }

    // Keyboard navigation
    editor.addCommand(
      monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.Comma,
      () => {
        const current = focusedBlockIndexRef.current;
        handleNavigate(current - 1);
      },
    );
    editor.addCommand(
      monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.Period,
      () => {
        const current = focusedBlockIndexRef.current;
        handleNavigate(current + 1);
      },
    );
  }, [handleNavigate]);

  if (loading) {
    return (
      <div className="grid h-full place-items-center bg-canvas text-fg">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading conflict…</span>
        </div>
      </div>
    );
  }

  if (loadError || !content) {
    return (
      <div className="grid h-full place-items-center bg-canvas text-red-300">
        <div className="text-sm">{loadError || 'Failed to load conflict'}</div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-canvas">
      <ConflictToolbar
        isResolved={isResolved}
        resolving={resolving}
        resolveError={resolveError}
        conflictCount={conflictBlocks.length}
        focusedIndex={focusedBlockIndex}
        onMarkResolved={handleMarkResolved}
        onNavigatePrev={() => handleNavigate(focusedBlockIndex - 1)}
        onNavigateNext={() => handleNavigate(focusedBlockIndex + 1)}
      />

      <div className="flex-1">
        <Group orientation="vertical">
          {/* Top: OURS vs BASE | THEIRS vs BASE */}
          <Panel defaultSize="50%" minSize="20%">
            <Group orientation="horizontal">
              <Panel defaultSize="50%" minSize="20%">
                <MonacoPanes
                  baseContent={content.base}
                  oursContent={content.ours}
                  theirsContent={content.theirs}
                  onMount={onDiffMount}
                />
              </Panel>
              <Separator className="w-px bg-border" />
              <Panel defaultSize="50%" minSize="20%">
                <div className="h-full" />
              </Panel>
            </Group>
          </Panel>

          <Separator className="h-px bg-border" />

          {/* Bottom: RESULT (editable) */}
          <Panel defaultSize="50%" minSize="30%">
            <ResultEditor
              value={resultText}
              onChange={(v) => setResultText(v ?? '')}
              onMount={onResultMount}
            />
          </Panel>
        </Group>
      </div>
    </div>
  );
}
