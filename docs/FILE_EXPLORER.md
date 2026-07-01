# File Explorer

**Collapsible file tree panel for browsing project structure without launching an IDE.**

---

## Overview

The File Explorer is a read-only sidebar (Cmd+B) that displays the current session's working directory as a navigable tree. It follows the same design pattern as the Terminal panel: hidden by default, keyboard-driven, and zero visual cost when closed.

**Use case:** Quick folder structure inspection during agent sessions without context-switching to Finder or an IDE.

---

## Features

### Core Functionality

- **Collapsible panel** — Hidden by default, appears on right side when opened
- **Tree navigation** — Expand/collapse folders, arrow key navigation
- **File opening** — Double-click or Enter opens files in FileViewModal
- **Gitignore filtering** — Automatically hides node_modules, .git, build artifacts
- **Inline search** — Filter tree by filename with live results
- **Context menu** — Right-click to copy paths or reveal in Finder
- **State persistence** — Expanded folders remembered per session

### Performance

- **Virtual scrolling** — Automatic for trees with >200 visible items
- **Lazy rendering** — Only visible items are in the DOM
- **60fps scrolling** — Smooth even with 10,000+ files
- **Debounced saves** — Expanded paths saved after 500ms of inactivity

---

## Layout

### Panel Structure

```
┌─────────────┬──────────────────────┬─────────────┐
│  Sessions   │       Chat           │   Files     │  ← When open
│    (28%)    │       (52%)          │   (20%)     │
└─────────────┴──────────────────────┴─────────────┘

┌─────────────┬──────────────────────────────────────┐
│  Sessions   │       Chat                           │  ← Default (closed)
│    (28%)    │       (72%)                          │
└─────────────┴──────────────────────────────────────┘
```

**Architecture:**
- Nested `ResizablePanelGroup` within chat area
- Right sidebar within horizontal split (Chat | File Explorer)
- Follows Terminal panel's collapsible pattern
- Sessions panel (left) unaffected by explorer state

### Proportions

- **Collapsed:** Chat takes full 72% width
- **Open:** Chat ~50%, File Explorer ~28% (first open)
- **Min width:** 15% (prevents over-compression)
- **Max width:** 40% (prevents chat from becoming too narrow)
- **User adjustable:** Drag ResizableHandle to resize, size persists globally

---

## Keyboard Shortcuts

### Global

| Shortcut | Action |
|----------|--------|
| **Cmd+B** | Toggle file explorer panel (sessions view only - disabled in Settings/Skills/Agents/Extensions) |

**Alternative:** Click the **FolderTree icon** in chat header (right side, next to Git icon, highlights when panel is open)

**Note:** Filter input auto-focused on open, cleared on session switch

### Panel-Scoped (when focused)

| Shortcut | Action |
|----------|--------|
| **↑** | Move selection up |
| **↓** | Move selection down |
| **→** | Expand folder |
| **←** | Collapse folder |
| **Enter** | Open file in FileViewModal |
| **Esc** | Close panel |
| **Cmd+F** | Focus filter input (if not already focused) |

**Note:** When panel opens via Cmd+B, filter input is automatically focused so you can immediately start typing to search.

---

## Context Menu

Right-click any file or folder to access:

- **Copy Absolute Path** — Full path to clipboard
- **Copy Relative Path** — Path relative to CWD
- **Reveal in Finder** — Opens Finder/Explorer at item location

**No file management:** The panel is read-only. Use Finder/Explorer for create/rename/delete operations.

---

## State Persistence

### Global (useResizablePanels)

**Key:** `explorer-v2`

**Persists:**
- Panel open/closed state
- Panel width (percentage)

**Storage:** localStorage via `useResizablePanels` hook

**Default:** Collapsed (`[100, 0]`)

### Per-Session (session.json)

**Field:** `SessionMetadata.fileExplorer.expandedPaths`

**Persists:**
- Array of absolute paths of expanded folders

**Storage:** `<userData>/sessions/<id>/session.json`

**Behavior:**
- Restored when switching sessions
- Saved after 500ms debounce on changes
- Empty array for new sessions

**Example:**
```json
{
  "id": "abc123",
  "fileExplorer": {
    "expandedPaths": [
      "/Users/user/project/src",
      "/Users/user/project/src/components"
    ]
  }
}
```

---

## Architecture

### Components

**Location:** `src/renderer/src/components/files/`

- **FileExplorerPanel.tsx** — Main panel component
  - Tree loading via `buildFileTree` IPC
  - Filter logic (client-side)
  - Virtual scrolling integration
  - Keyboard navigation
  - State persistence

- **TreeNode.tsx** — Individual tree item
  - Expand/collapse chevron
  - Folder/File icons (lucide-react)
  - Depth-based indentation (12px per level)
  - Context menu
  - Size display (files <1MB)

- **types.ts** — TypeScript interfaces
  - `FileTreeNode` interface
  - `FlatTreeNode` for virtualizer

### IPC Methods

**Location:** `src/main/files/list-directory.ts`

**Handlers:**
- `files:listDirectory` — List immediate children (non-recursive)
- `files:buildFileTree` — Recursive tree builder with maxDepth

**Implementation:**
```typescript
export function listDirectory(args: {
  path: string;
  root: string;
  includeHidden?: boolean;
}): FileTreeNode[]

export function buildFileTree(args: {
  path: string;
  root: string;
  includeHidden?: boolean;
  maxDepth?: number;
}): FileTreeNode[]
```

**Gitignore filtering:**
- Reuses `loadIgnore()` logic from `search.ts`
- ALWAYS_IGNORE set: `.git`, `node_modules`, `.next`, `.turbo`, `.cache`, `.venv`, `__pycache__`, `.nuxt`, `dist`, `build`, `out`, `.output`

**Sorting:**
- Directories first
- Then files
- Alphabetically within each group

---

## Virtual Scrolling

**Library:** `@tanstack/react-virtual`

**Activation:** Automatic when tree has >200 visible items

**Configuration:**
- Estimated item height: 28px
- Overscan: 10 items (renders extra items above/below viewport)
- Scroll-to-selected: Auto-scrolls to keep selected item visible

**Performance:**
- **≤200 items:** Simple rendering (no virtualization overhead)
- **>200 items:** Virtual scrolling (O(visible) render time)
- **Debug logging:** Console logs when virtual mode activates

**Rendering strategy:**
- Virtual items positioned absolutely with `transform: translateY()`
- Parent container height = total content height
- Only visible + overscan items rendered to DOM

---

## Filtering

**Trigger:** User types in filter input (top of panel)

**Debounce:** 150ms

**Strategy:** Client-side filtering (no IPC calls)

**Session isolation:** Filter query is **cleared on session switch** (each session has different CWD)

**Logic:**
- Shows nodes matching query OR having matching descendants
- **Auto-expands** folders containing matches to reveal them
- **Highlights** matched text in filenames with accent background
- Preserves tree structure (parents of matches remain visible)

**Example:** Type "test" and:
- Folder `/src/components` auto-expands to reveal `/src/components/TestUtils.tsx`
- "Test" in "TestUtils.tsx" is highlighted
- Parent folders remain visible even if names don't match

**Empty state:** "No files match filter" when no results

**Clearing:** Type clears filter, folders collapse back to user-expanded state

---

## Empty States

### No Working Directory

```
No working directory set
Select a folder for this session
```

### Loading

```
[Spinner] Loading...
```

### Error

```
Failed to load directory
```

### Empty Directory

```
(empty directory)
```

### No Filter Results

```
No files match filter
```

---

## Design Decisions

### Why Read-Only?

**Reasoning:**
- Keeps implementation simple (no rename/delete/create flows)
- Avoids duplicating Finder/Explorer functionality
- Reduces maintenance burden (no undo, confirmation dialogs)
- File management belongs in OS file manager, not chat app

**What users can do:**
- Copy paths to clipboard
- Reveal in Finder
- Open files in FileViewModal
- Attach files via @-mention picker

### Why Right Sidebar?

**Pros:**
- Chat remains primary focus at 72% when closed
- Sessions panel unaffected by explorer state
- Opening explorer takes from chat, not sessions
- Mirrors Git Diff's "file list on left, content on right" pattern

**Cons:**
- Deviates from VS Code's left sidebar convention

**Verdict:** Right sidebar better fits MI's chat-first layout.

### Why Cmd+B?

**Standard IDE convention:**
- VS Code: Cmd+B toggles primary sidebar
- Sublime Text: Cmd+K, Cmd+B
- Atom: Cmd+\\

**Rationale:**
- Available (no conflicts with existing MI shortcuts)
- Semantic fit (B = Browse / Bar)
- Cmd+F already taken (in-terminal search)
- Matches user muscle memory from IDEs

### Why Gitignore-Aware?

**Problem:** Large projects have 1000s of files in node_modules, .next, etc.

**Solution:** Respect `.gitignore` patterns + ALWAYS_IGNORE set

**Benefit:**
- Faster tree loading
- Cleaner UI (only relevant files shown)
- Lower memory footprint

---

## Integration with Other Features

### FileViewModal

- Explorer opens files in the same viewer as Search Everywhere and Recent Files
- Shared `handleOpenFile` callback lifted to App.tsx
- Files open with line number 1 (no line highlighting from tree)

### Search Everywhere (Double-Shift)

- Complementary, not redundant:
  - **File Explorer:** Browse structure, expand folders
  - **Search Everywhere:** Find by name or content

### Git Diff Review (Cmd+G)

- Shows changed files only
- File Explorer shows entire tree
- Both use similar tree rendering patterns

### Terminal (Cmd+T)

- Shares collapsible panel architecture
- Both use `useResizablePanels` for persistence
- Independent keyboard shortcuts (Cmd+B vs Cmd+T)

---

## Future Enhancements

**Not in current scope:**

1. **Git status badges** — Show M/N/D/R indicators like Git Diff Review
2. **"Follow active file"** — Auto-expand to currently viewed file
3. **Drag-and-drop attach** — Drag files into chat input
4. **Multi-root workspaces** — Show multiple project roots in one tree
5. **FS watcher** — Live-update tree when files change on disk
6. **Search within tree** — Jump to file by typing (like VS Code)

---

## Troubleshooting

### Panel doesn't appear

**Check:**
- Is a working directory set for the session?
- Try Cmd+B to toggle panel visibility
- Look for errors in DevTools console

### "Failed to load directory"

**Possible causes:**
- Permission denied (try a different directory)
- Symlink loop
- Very large directory (>50k files)

**Solution:**
- Check file permissions
- Try a different CWD
- Check console for detailed error

### Tree loads slowly

**Check:**
- How many files are in the directory? (>10k?)
- Is gitignore filtering working? (node_modules should be hidden)

**Solution:**
- Virtual scrolling activates at >200 items automatically
- Add more patterns to `.gitignore` if needed
- Reduce `maxDepth` (currently 3) by editing component

### Expanded folders not persisting

**Check:**
- Is session saved? (New unsaved sessions have no persistence)
- Check DevTools console for save errors

**Solution:**
- Send at least one message to persist session
- Check `<userData>/sessions/<id>/session.json` for `fileExplorer` field

---

## Implementation Details

### Virtual Scrolling Activation

Console log when virtual mode activates:

```
[FileExplorer] Virtual scrolling activated for 247 items
```

**Threshold:** 200 visible items

**Performance characteristics:**
- Simple mode (≤200): ~5ms render for 200 items
- Virtual mode (>200): ~2-3ms render regardless of size

### Expanded Paths Save

**Debounce:** 500ms

**Trigger:** Any folder expand/collapse action

**Logic:**
```typescript
useEffect(() => {
  if (!sessionId) return;
  
  const timeout = setTimeout(() => {
    const paths = Array.from(expandedPaths);
    updateSessionMeta(sessionId, {
      fileExplorer: { expandedPaths: paths },
    });
  }, 500);
  
  return () => clearTimeout(timeout);
}, [expandedPaths, sessionId]);
```

---

## Related Docs

- [Architecture](./ARCHITECTURE.md) — File Explorer section in Storage layout
- [Terminal](./TERMINAL.md) — Similar collapsible panel pattern
- [Roadmap](./ROADMAP.md) — Feature status and future enhancements
- [AGENTS.md](../AGENTS.md) — Component file size and UI conventions

---

**Implementation:** Phases 0-8 complete (IPC, component, layout, keyboard, persistence, virtual scrolling, context menu, polish)

**Testing:** Phase 9 (edge cases, performance validation)

**Docs:** Phase 10 (ROADMAP, README, CHANGELOG)
