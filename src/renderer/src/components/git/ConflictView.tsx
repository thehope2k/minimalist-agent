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
// resolution UI works internally. ReactDOM.createRoot renders the
// ConflictBlockWidget component into each widget's DOM node.
//
// When the user accepts a block or edits the RESULT manually, the conflict
// markers are removed incrementally. Once hasConflictMarkers() returns false,
// the "Mark Resolved" button becomes active and calls onResolved().

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { DiffOnMount, OnMount } from '@monaco-editor/react';
import type * as MonacoType from 'monaco-editor';
import { Check, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { cn } from '@/lib/utils';
import { IS_MAC as _IS_MAC } from '@/lib/shortcuts';
import { registerAppMonacoTheme } from '@/lib/monaco-setup';
import { parseConflictBlocks, hasConflictMarkers, resolveBlock } from './conflict-parser';
import { ConflictBlockWidget } from './conflict-flow/ConflictBlockWidget';
import type { ConflictContent, GitFileEntry } from './types';

const DiffEditor = lazy(() =>
  import('@monaco-editor/react').then((m) => ({ default: m.DiffEditor })),
);
const Editor = lazy(() =>
  import('@monaco-editor/react').then((m) => ({ default: m.Editor })),
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConflictViewProps {
  file: GitFileEntry;
  onResolved: () => void;
}

interface WidgetEntry {
  widget: MonacoType.editor.IContentWidget;
  root: Root;
  lineRef: { current: number };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SHARED_OPTIONS: MonacoType.editor.IDiffEditorConstructionOptions = {
  readOnly: true,
  originalEditable: false,
  minimap: { enabled: false },
  fontSize: 13,
  lineHeight: 21,
  fontFamily: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace',
  scrollBeyondLastLine: false,
  wordWrap: 'off',
  renderSideBySide: true,
  ignoreTrimWhitespace: false,
  renderIndicators: true,
  // Disable semantic features since language workers aren't available
  semanticValidation: false,
  syntaxValidation: false,
  quickSuggestions: false,
  suggest: { enabled: false },
  parameterHints: { enabled: false },
};

const RESULT_OPTIONS: MonacoType.editor.IStandaloneEditorConstructionOptions = {
  minimap: { enabled: false },
  fontSize: 13,
  lineHeight: 21,
  fontFamily: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace',
  scrollBeyondLastLine: false,
  wordWrap: 'off',
  lineNumbers: 'on',
  // Disable semantic features since language workers aren't available
  semanticValidation: false,
  syntaxValidation: false,
  quickSuggestions: false,
  suggest: { enabled: false },
  parameterHints: { enabled: false },
};

// Hardcoded hex approximations of OKLCH tokens (CSS vars unavailable in Monaco).
// Keep in sync with globals.css conflict decoration classes.
const CONFLICT_COLORS = {
  oursLine:    '#1a3828',
  theirsLine:  '#1a2838',
  markerLine:  '#382810',
} as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ConflictView({ file, onResolved }: ConflictViewProps) {
  const [content, setContent] = useState<ConflictContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [resultText, setResultText] = useState('');
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  const resultEditorRef = useRef<MonacoType.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof MonacoType | null>(null);
  const decoCollectionRef = useRef<MonacoType.editor.IEditorDecorationsCollection | null>(null);
  const widgetMapRef = useRef<Map<number, WidgetEntry>>(new Map());

  // Index of the conflict block the user is currently navigating to.
  // Drives scroll position in the RESULT editor and a "block N/M" counter.
  const [focusedBlockIndex, setFocusedBlockIndex] = useState(0);

  // Derive conflict blocks from the current result text.
  const conflictBlocks = parseConflictBlocks(resultText);
  const isResolved = !hasConflictMarkers(resultText);

  // Stable refs used inside Monaco commands so closures never stale.
  const resultTextRef = useRef(resultText);
  const conflictBlocksRef = useRef(conflictBlocks);
  const focusedBlockIndexRef = useRef(focusedBlockIndex);
  // applyResolutionRef removed — only navigation is keyboard-driven; accept actions are mouse-only.
  resultTextRef.current = resultText;
  conflictBlocksRef.current = conflictBlocks;
  focusedBlockIndexRef.current = focusedBlockIndex;

  // ── Load 3-way conflict content ─────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    window.api.git
      .conflictContent({
        repoRoot: file.repoRoot,
        relativePath: file.relativePath,
        absolutePath: file.absolutePath,
      })
      .then((c) => {
        setContent(c);
        setResultText(c.working);
      })
      .catch((e) => {
        setLoadError(e instanceof Error ? e.message : 'Failed to load conflict content');
      })
      .finally(() => setLoading(false));
  }, [file.absolutePath, file.relativePath, file.repoRoot]);

  // ── RESULT editor decorations ────────────────────────────────────────────
  useEffect(() => {
    const monaco = monacoRef.current;
    const editor = resultEditorRef.current;
    const col = decoCollectionRef.current;
    if (!monaco || !editor || !col) return;

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

    col.set(decos);
  }, [conflictBlocks]);

  // ── Monaco contentWidgets: accept buttons per conflict block ─────────────
  useEffect(() => {
    const editor = resultEditorRef.current;
    if (!editor) return;

    const nextKeys = new Set(conflictBlocks.map((_, i) => i));

    // Remove widgets for blocks that no longer exist.
    for (const [key, entry] of widgetMapRef.current) {
      if (!nextKeys.has(key)) {
        editor.removeContentWidget(entry.widget);
        entry.root.unmount();
        widgetMapRef.current.delete(key);
      }
    }

    // Add / update widgets for current blocks.
    for (let i = 0; i < conflictBlocks.length; i++) {
      const block = conflictBlocks[i];
      let entry = widgetMapRef.current.get(i);

      if (!entry) {
        // Create a new widget for this block.
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

      // Always re-render with fresh handlers and updated block index.
      // Capture block reference for this iteration.
      const capturedBlock = block;
      const capturedIndex = i;
      const capturedTotal = conflictBlocks.length;

      entry.lineRef.current = block.startLine;
      editor.layoutContentWidget(entry.widget);

      entry.root.render(
        <ConflictBlockWidget
          blockIndex={capturedIndex}
          totalBlocks={capturedTotal}
          onAcceptOurs={() => {
            const next = resolveBlock(resultText, capturedBlock, capturedBlock.oursContent);
            applyResolution(next);
          }}
          onAcceptTheirs={() => {
            const next = resolveBlock(resultText, capturedBlock, capturedBlock.theirsContent);
            applyResolution(next);
          }}
          onAcceptBoth={() => {
            const combined = [capturedBlock.oursContent, capturedBlock.theirsContent]
              .filter(Boolean)
              .join('\n');
            const next = resolveBlock(resultText, capturedBlock, combined);
            applyResolution(next);
          }}
          onIgnore={() => {
            // Remove markers but keep both contents to let user edit manually.
            const combined = [capturedBlock.oursContent, capturedBlock.theirsContent]
              .filter(Boolean)
              .join('\n');
            const next = resolveBlock(resultText, capturedBlock, combined);
            applyResolution(next);
          }}
        />,
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conflictBlocks.length, resultText]);

  // Cleanup widgets on unmount.
  useEffect(() => {
    return () => {
      for (const entry of widgetMapRef.current.values()) {
        entry.root.unmount();
      }
      widgetMapRef.current.clear();
    };
  }, []);

  // ── Resolution helpers ───────────────────────────────────────────────────
  const applyResolution = useCallback((newText: string) => {
    const editor = resultEditorRef.current;
    if (!editor) return;
    const model = editor.getModel();
    if (!model) return;
    // Use pushEditOperations so Ctrl+Z works.
    editor.pushUndoStop();
    model.pushEditOperations(
      [],
      [{ range: model.getFullModelRange(), text: newText }],
      () => null,
    );
    editor.pushUndoStop();
    setResultText(newText);
  }, []);

  // Keep stable ref in sync so Monaco commands can always call the latest version.
  // (applyResolutionRef removed)

  const handleMarkResolved = useCallback(async () => {
    setResolving(true);
    setResolveError(null);
    try {
      const result = await window.api.git.resolveConflict({
        repoRoot: file.repoRoot,
        relativePath: file.relativePath,
        absolutePath: file.absolutePath,
        content: resultText,
      });
      if (!result.ok) throw new Error(result.error ?? 'Failed to resolve conflict');
      onResolved();
    } catch (e) {
      setResolveError(e instanceof Error ? e.message : String(e));
    } finally {
      setResolving(false);
    }
  }, [file, resultText, onResolved]);

  // ── Shared Monaco setup ──────────────────────────────────────────────────
  // beforeMount only registers the theme; monacoRef is set inside handleResultMount.
  const handleBeforeMount = useCallback((monaco: typeof MonacoType) => {
    registerAppMonacoTheme(monaco);
  }, []);

  const handleResultMount: OnMount = useCallback((editor, monaco) => {
    resultEditorRef.current = editor;
    monacoRef.current = monaco;
    decoCollectionRef.current = editor.createDecorationsCollection([]);

    // ── Keyboard commands registered on the RESULT editor ─────────────
    // These use Monaco KeyMod / KeyCode so they fire even when the editor
    // canvas has focus (the outer React keydown handler doesn't see those).
    const { KeyMod, KeyCode } = monaco;

    // Alt+↓ — next conflict block
    editor.addCommand(KeyMod.Alt | KeyCode.DownArrow, () => {
      const blocks = conflictBlocksRef.current;
      if (blocks.length === 0) return;
      const next = Math.min(blocks.length - 1, focusedBlockIndexRef.current + 1);
      setFocusedBlockIndex(next);
      editor.revealLineInCenter(blocks[next].startLine);
    });

    // Alt+↑ — previous conflict block
    editor.addCommand(KeyMod.Alt | KeyCode.UpArrow, () => {
      const blocks = conflictBlocksRef.current;
      if (blocks.length === 0) return;
      const prev = Math.max(0, focusedBlockIndexRef.current - 1);
      setFocusedBlockIndex(prev);
      editor.revealLineInCenter(blocks[prev].startLine);
    });
  }, []);

  const handleResultChange = useCallback((value: string | undefined) => {
    setResultText(value ?? '');
  }, []);

  // ── Shared DiffEditor mount helper ───────────────────────────────────────
  const handleDiffMount: DiffOnMount = useCallback(() => {
    // No-op — diff editors are read-only, no event handling needed.
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-fg-subtle" strokeWidth={1.5} />
      </div>
    );
  }

  if (loadError || !content) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6">
        <p className="text-center text-xs text-red-400">{loadError ?? 'Failed to load conflict content'}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between border-b border-border/60 bg-panel px-3 py-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-fg-muted">
            Merge conflict — {file.relativePath.split('/').pop()}
          </span>
          {conflictBlocks.length > 0 && (
            <>
              {/* Block navigation buttons */}
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  title="Previous conflict (Alt+↑)"
                  disabled={focusedBlockIndex === 0}
                  onClick={() => {
                    const prev = Math.max(0, focusedBlockIndex - 1);
                    setFocusedBlockIndex(prev);
                    resultEditorRef.current?.revealLineInCenter(conflictBlocks[prev].startLine);
                  }}
                  className="rounded p-0.5 text-fg-subtle transition-colors hover:bg-elevated hover:text-fg disabled:opacity-30 focus-visible:outline-none"
                >
                  <ChevronUp className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
                <span className="text-[10px] tabular-nums text-fg-subtle">
                  {focusedBlockIndex + 1}/{conflictBlocks.length}
                </span>
                <button
                  type="button"
                  title="Next conflict (Alt+↓)"
                  disabled={focusedBlockIndex >= conflictBlocks.length - 1}
                  onClick={() => {
                    const next = Math.min(conflictBlocks.length - 1, focusedBlockIndex + 1);
                    setFocusedBlockIndex(next);
                    resultEditorRef.current?.revealLineInCenter(conflictBlocks[next].startLine);
                  }}
                  className="rounded p-0.5 text-fg-subtle transition-colors hover:bg-elevated hover:text-fg disabled:opacity-30 focus-visible:outline-none"
                >
                  <ChevronDown className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
              </div>

              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-300 tabular-nums">
                {conflictBlocks.length} unresolved
              </span>

              {/* Keyboard hint — compact, only shown when blocks remain */}
              <span className="hidden text-[10px] text-fg-subtle/50 xl:block">
                Alt+↑↓ navigate
              </span>
            </>
          )}
          {isResolved && (
            <span className="flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-300">
              <Check className="h-2.5 w-2.5" strokeWidth={2.5} />
              All resolved
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => void handleMarkResolved()}
          disabled={!isResolved || resolving}
          className={cn(
            'flex items-center gap-1.5 rounded px-3 py-1 text-[11px] font-medium transition-colors',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent',
            isResolved && !resolving
              ? 'bg-emerald-500/80 text-white hover:bg-emerald-500'
              : 'cursor-not-allowed bg-elevated text-fg-subtle',
          )}
        >
          {resolving && <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2} />}
          Mark Resolved
        </button>
      </div>

      {/* Error bar */}
      {resolveError && (
        <div className="shrink-0 border-b border-red-500/20 bg-red-500/8 px-3 py-2">
          <p className="font-mono text-[10px] text-red-400">{resolveError}</p>
        </div>
      )}

      {/* 3-pane editor layout */}
      <div className="min-h-0 flex-1">
        <PanelGroup direction="vertical">
          {/* Top row: OURS + THEIRS */}
          <Panel defaultSize={40} minSize={20}>
            <PanelGroup direction="horizontal">
              {/* OURS — base → ours diff */}
              <Panel defaultSize={50} minSize={20}>
                <div className="flex h-full flex-col">
                  <PanelLabel label="Ours (HEAD)" color="emerald" />
                  <Suspense fallback={<EditorLoader />}>
                    <DiffEditor
                      original={content.base}
                      modified={content.ours}
                      language={content.language}
                      theme="minimalist-dark"
                      options={{ ...SHARED_OPTIONS, renderSideBySide: false }}
                      beforeMount={handleBeforeMount}
                      onMount={handleDiffMount}
                      height="100%"
                      loading={<EditorLoader />}
                    />
                  </Suspense>
                </div>
              </Panel>

              <PanelResizeHandle className="w-px bg-border/60 transition-colors hover:bg-accent/60" />

              {/* THEIRS — base → theirs diff */}
              <Panel defaultSize={50} minSize={20}>
                <div className="flex h-full flex-col">
                  <PanelLabel label="Theirs (Incoming)" color="blue" />
                  <Suspense fallback={<EditorLoader />}>
                    <DiffEditor
                      original={content.base}
                      modified={content.theirs}
                      language={content.language}
                      theme="minimalist-dark"
                      options={{ ...SHARED_OPTIONS, renderSideBySide: false }}
                      beforeMount={handleBeforeMount}
                      onMount={handleDiffMount}
                      height="100%"
                      loading={<EditorLoader />}
                    />
                  </Suspense>
                </div>
              </Panel>
            </PanelGroup>
          </Panel>

          <PanelResizeHandle className="h-px bg-border/60 transition-colors hover:bg-accent/60" />

          {/* RESULT — editable */}
          <Panel defaultSize={60} minSize={25}>
            <div className="flex h-full flex-col">
              <PanelLabel
                label={isResolved ? 'Result — resolved ✓' : 'Result — edit or accept above'}
                color={isResolved ? 'emerald' : 'neutral'}
              />
              <div className="min-h-0 flex-1">
                <Suspense fallback={<EditorLoader />}>
                  <Editor
                    value={resultText}
                    language={content.language}
                    theme="minimalist-dark"
                    options={RESULT_OPTIONS}
                    beforeMount={handleBeforeMount}
                    onMount={handleResultMount}
                    onChange={handleResultChange}
                    height="100%"
                    loading={<EditorLoader />}
                  />
                </Suspense>
              </div>
            </div>
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small sub-components
// ---------------------------------------------------------------------------

function EditorLoader() {
  return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="h-5 w-5 animate-spin text-fg-subtle" strokeWidth={1.5} />
    </div>
  );
}

function PanelLabel({ label, color }: { label: string; color: 'emerald' | 'blue' | 'neutral' }) {
  const colorCls =
    color === 'emerald' ? 'text-emerald-400 bg-emerald-500/6 border-emerald-500/15' :
    color === 'blue'    ? 'text-blue-400 bg-blue-500/6 border-blue-500/15' :
    'text-fg-muted bg-elevated/40 border-border/60';
  return (
    <div className={cn('shrink-0 border-b px-3 py-1 text-[10px] font-medium uppercase tracking-wider', colorCls)}>
      {label}
    </div>
  );
}
