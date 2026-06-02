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

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { useFilteredItems } from './mention-menu/useFilteredItems';
import { useKeyboardNav } from './mention-menu/useKeyboardNav';
import {
  Wrapper,
  SectionHeader,
  SkillRow,
  ExtensionRow,
  FileRow,
} from './mention-menu/RowComponents';
import type { MentionMenuProps, MentionMenuHandle } from './mention-menu/types';

export type { MentionItem, MentionMenuHandle } from './mention-menu/types';

export const MentionMenu = function MentionMenuImpl(
  props: MentionMenuProps & {
    handleRef?: React.MutableRefObject<MentionMenuHandle | null>;
  },
) {
  const { open, query, skills, extensions, cwd, onSelect, onClose, handleRef } =
    props;

  const listRef = useRef<HTMLUListElement | null>(null);

  // Filter items based on query
  const { filteredSkills, filteredExtensions, filteredFiles, items } =
    useFilteredItems({
      open,
      query,
      skills,
      extensions,
      cwd,
    });

  // Keyboard navigation
  const { activeIdx, setActiveIdx } = useKeyboardNav({
    items,
    query,
    handleRef,
    listRef,
    onSelect,
  });

  // Auto-close when the user has typed enough to filter everything out.
  useEffect(() => {
    if (open && query.length > 0 && items.length === 0 && !cwd) {
      onClose();
    }
  }, [open, query, items.length, cwd, onClose]);

  if (!open) return null;

  const showEmpty = items.length === 0 && (!cwd || query.trim().length > 0);

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
        {filteredSkills.length > 0 && <SectionHeader label="Skills" />}
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

        {filteredExtensions.length > 0 && <SectionHeader label="Extensions" />}
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

        {filteredFiles.length > 0 && <SectionHeader label="Files" />}
        {filteredFiles.map((entry, i) => {
          const idx = filteredSkills.length + filteredExtensions.length + i;
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
          <li className="px-3 py-3 text-xs text-fg-subtle">No matches.</li>
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
