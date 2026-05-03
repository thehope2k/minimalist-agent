// Inline @-mention picker. Surfaces installed skills and project files in
// one popover, grouped by section.
//
// Keyboard contract (driven by parent textarea via the imperative handle):
//   ↑/↓     — move selection (skips section headers)
//   Enter   — confirm
//   Esc     — close
//   Tab     — confirm (alternate)
//
// File search is debounced 150 ms; once the first IPC call returns for
// the current cwd, subsequent keystrokes filter client-side without a
// round trip (the cache lives in `lib/files.ts`).

import { useEffect, useMemo, useRef, useState } from 'react';
import { File as FileIcon, Folder as FolderIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  FileSearchEntry,
  LoadedExtension,
  LoadedSkill,
} from '@/lib/electron';
import { scoreEntry, searchFiles } from '@/lib/files';
import { displayDescription, displayName, isEnabled } from '@/lib/extensions';
import { SkillAvatar } from '../skills/SkillAvatar';
import { ExtensionAvatar } from '../extensions/ExtensionAvatar';

/** Discriminated union of pickable items. */
export type MentionItem =
  | { kind: 'skill'; skill: LoadedSkill }
  | { kind: 'extension'; extension: LoadedExtension }
  | { kind: 'file'; entry: FileSearchEntry };

export interface MentionMenuProps {
  open: boolean;
  query: string;
  skills: LoadedSkill[];
  /** Only enabled extensions are pickable — disabled ones can't act anyway. */
  extensions: LoadedExtension[];
  /** Working directory to search files under. Empty = no file results. */
  cwd?: string;
  onSelect: (item: MentionItem) => void;
  onClose: () => void;
}

export interface MentionMenuHandle {
  moveUp: () => void;
  moveDown: () => void;
  /** Returns true if a selection was made (signal to swallow the keystroke). */
  confirm: () => boolean;
}

const FILES_LIMIT = 25;
const FILE_SEARCH_DEBOUNCE_MS = 150;

export const MentionMenu = function MentionMenuImpl(
  props: MentionMenuProps & {
    handleRef?: React.MutableRefObject<MentionMenuHandle | null>;
  },
) {
  const { open, query, skills, extensions, cwd, onSelect, onClose, handleRef } = props;

  const [activeIdx, setActiveIdx] = useState(0);
  const [files, setFiles] = useState<FileSearchEntry[]>([]);
  const listRef = useRef<HTMLUListElement | null>(null);

  /* ---------- skill scoring ---------- */
  const filteredSkills = useMemo(() => {
    const q = query.trim().toLowerCase();
    const ranked = skills
      .map((s) => ({
        skill: s,
        score: scoreSkill(s, q),
      }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
    return ranked.map((r) => r.skill);
  }, [skills, query]);

  /* ---------- extension scoring ---------- */
  const filteredExtensions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return extensions
      .filter(isEnabled)
      .map((e) => ({ extension: e, score: scoreExtension(e, q) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.extension);
  }, [extensions, query]);

  /* ---------- file search (debounced IPC) ---------- */
  useEffect(() => {
    if (!open || !cwd) {
      setFiles([]);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      void searchFiles(cwd, query, FILES_LIMIT).then((res) => {
        if (!cancelled) setFiles(res);
      });
    }, FILE_SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [open, cwd, query]);

  const filteredFiles = useMemo(() => {
    if (!query.trim()) return files.slice(0, FILES_LIMIT);
    return files
      .map((e) => ({ entry: e, score: scoreEntry(e, query) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, FILES_LIMIT)
      .map((x) => x.entry);
  }, [files, query]);

  /* ---------- flat selectable list (skips section headers) ---------- */
  const items: MentionItem[] = useMemo(() => {
    return [
      ...filteredSkills.map(
        (skill) => ({ kind: 'skill', skill }) as const,
      ),
      ...filteredExtensions.map(
        (extension) => ({ kind: 'extension', extension }) as const,
      ),
      ...filteredFiles.map(
        (entry) => ({ kind: 'file', entry }) as const,
      ),
    ];
  }, [filteredSkills, filteredExtensions, filteredFiles]);

  // Reset selection on items change.
  useEffect(() => {
    setActiveIdx(0);
  }, [items.length, query]);

  // Auto-close when the user has typed enough to filter everything out.
  useEffect(() => {
    if (open && query.length > 0 && items.length === 0 && !cwd) {
      onClose();
    }
  }, [open, query, items.length, cwd, onClose]);

  // Imperative handle — parent textarea drives nav.
  useEffect(() => {
    if (!handleRef) return;
    handleRef.current = {
      moveUp: () => {
        if (items.length === 0) return;
        setActiveIdx((i) => (i - 1 + items.length) % items.length);
      },
      moveDown: () => {
        if (items.length === 0) return;
        setActiveIdx((i) => (i + 1) % items.length);
      },
      confirm: () => {
        const item = items[activeIdx];
        if (item) {
          onSelect(item);
          return true;
        }
        return false;
      },
    };
  }, [handleRef, items, activeIdx, onSelect]);

  // Keep the active row scrolled into view.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const el = list.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  if (!open) return null;

  const showEmpty =
    items.length === 0 && (!cwd || query.trim().length > 0);

  return (
    <Wrapper>
      <ul
        ref={listRef}
        className={cn(
          // Stable height while typing: min-h keeps the popover from
          // collapsing as filters shrink the list (which would otherwise
          // make the top edge jump because we're bottom-anchored). max-h
          // caps growth and enables internal scroll.
          'scroll-thin min-h-[18rem] max-h-[24rem] overflow-y-auto pb-1',
        )}
      >
        {filteredSkills.length > 0 && (
          <SectionHeader label="Skills" />
        )}
        {filteredSkills.map((skill, i) => {
          const idx = i;
          return (
            <SkillRow
              key={skill.slug}
              skill={skill}
              active={idx === activeIdx}
              dataIdx={idx}
              onMouseEnter={() => setActiveIdx(idx)}
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect({ kind: 'skill', skill });
              }}
            />
          );
        })}

        {filteredExtensions.length > 0 && (
          <SectionHeader label="Extensions" />
        )}
        {filteredExtensions.map((extension, i) => {
          const idx = filteredSkills.length + i;
          return (
            <ExtensionRow
              key={extension.slug}
              extension={extension}
              active={idx === activeIdx}
              dataIdx={idx}
              onMouseEnter={() => setActiveIdx(idx)}
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect({ kind: 'extension', extension });
              }}
            />
          );
        })}

        {filteredFiles.length > 0 && (
          <SectionHeader label="Files" />
        )}
        {filteredFiles.map((entry, i) => {
          const idx =
            filteredSkills.length + filteredExtensions.length + i;
          return (
            <FileRow
              key={entry.absolutePath}
              entry={entry}
              active={idx === activeIdx}
              dataIdx={idx}
              onMouseEnter={() => setActiveIdx(idx)}
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect({ kind: 'file', entry });
              }}
            />
          );
        })}

        {showEmpty && (
          <li className="px-3 py-3 text-xs text-fg-subtle">
            No matches.
          </li>
        )}
        {items.length === 0 && !query && skills.length === 0 && !cwd && (
          <li className="px-3 py-3 text-xs text-fg-subtle">
            No skills installed and no working folder set.
          </li>
        )}
      </ul>
    </Wrapper>
  );
};

/* ---------- subcomponents ---------- */

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute bottom-full left-0 right-0 z-30 mb-1">
      <div className="overflow-hidden rounded-lg border border-border bg-panel shadow-2xl">
        {children}
      </div>
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <li className="sticky top-0 z-10 border-b border-border/60 bg-panel/95 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-fg-subtle backdrop-blur">
      {label}
    </li>
  );
}

function SkillRow({
  skill,
  active,
  dataIdx,
  onMouseEnter,
  onMouseDown,
}: {
  skill: LoadedSkill;
  active: boolean;
  dataIdx: number;
  onMouseEnter: () => void;
  onMouseDown: (e: React.MouseEvent) => void;
}) {
  return (
    <li
      data-idx={dataIdx}
      onMouseEnter={onMouseEnter}
      onMouseDown={onMouseDown}
      className={cn(
        'flex cursor-pointer items-start gap-2 px-3 py-1.5 text-sm',
        active ? 'bg-elevated' : 'hover:bg-elevated/60',
      )}
    >
      <SkillAvatar skill={skill} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-fg">{skill.metadata.name}</span>
          <span className="ml-auto shrink-0 font-mono text-[10px] text-fg-subtle">
            {skill.slug}
          </span>
        </div>
        <div className="truncate text-xs text-fg-subtle">
          {skill.metadata.description}
        </div>
      </div>
    </li>
  );
}

function FileRow({
  entry,
  active,
  dataIdx,
  onMouseEnter,
  onMouseDown,
}: {
  entry: FileSearchEntry;
  active: boolean;
  dataIdx: number;
  onMouseEnter: () => void;
  onMouseDown: (e: React.MouseEvent) => void;
}) {
  const Icon = entry.type === 'directory' ? FolderIcon : FileIcon;
  // Show parent path as a quiet suffix so users can disambiguate same-named files.
  const parent = entry.relativePath.includes('/')
    ? entry.relativePath.slice(0, entry.relativePath.lastIndexOf('/'))
    : null;
  return (
    <li
      data-idx={dataIdx}
      onMouseEnter={onMouseEnter}
      onMouseDown={onMouseDown}
      className={cn(
        'flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm',
        active ? 'bg-elevated' : 'hover:bg-elevated/60',
      )}
    >
      <Icon
        className={cn(
          'h-3.5 w-3.5 shrink-0',
          entry.type === 'directory' ? 'text-fg-muted' : 'text-fg-subtle',
        )}
        strokeWidth={1.75}
      />
      <span className="truncate text-fg">{entry.name}</span>
      {parent && (
        <span className="ml-auto truncate font-mono text-[11px] text-fg-subtle">
          {parent}
        </span>
      )}
    </li>
  );
}

/* ---------- helpers ---------- */

function scoreSkill(skill: LoadedSkill, q: string): number {
  if (!q) return 1;
  const slug = skill.slug.toLowerCase();
  const name = skill.metadata.name.toLowerCase();
  const desc = skill.metadata.description.toLowerCase();
  if (slug.startsWith(q) || name.startsWith(q)) return 3;
  if (slug.includes(q) || name.includes(q)) return 2;
  if (desc.includes(q)) return 1;
  return 0;
}

function scoreExtension(extension: LoadedExtension, q: string): number {
  if (!q) return 1;
  const slug = extension.slug.toLowerCase();
  const name = displayName(extension).toLowerCase();
  const desc = displayDescription(extension).toLowerCase();
  if (slug.startsWith(q) || name.startsWith(q)) return 3;
  if (slug.includes(q) || name.includes(q)) return 2;
  if (desc.includes(q)) return 1;
  return 0;
}

function ExtensionRow({
  extension,
  active,
  dataIdx,
  onMouseEnter,
  onMouseDown,
}: {
  extension: LoadedExtension;
  active: boolean;
  dataIdx: number;
  onMouseEnter: () => void;
  onMouseDown: (e: React.MouseEvent) => void;
}) {
  return (
    <li
      data-idx={dataIdx}
      onMouseEnter={onMouseEnter}
      onMouseDown={onMouseDown}
      className={cn(
        'flex cursor-pointer items-start gap-2 px-3 py-1.5 text-sm',
        active ? 'bg-elevated' : 'hover:bg-elevated/60',
      )}
    >
      <ExtensionAvatar extension={extension} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-fg">{displayName(extension)}</span>
          <span className="ml-auto shrink-0 font-mono text-[10px] text-fg-subtle">
            {extension.slug}
          </span>
        </div>
        <div className="truncate text-xs text-fg-subtle">
          {displayDescription(extension)}
        </div>
      </div>
    </li>
  );
}

