import { File as FileIcon, Folder as FolderIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FileSearchEntry, LoadedExtension, LoadedSkill } from '@/lib/electron';
import { displayDescription, displayName } from '@/lib/extensions';
import { SkillAvatar } from '@/components/skills/SkillAvatar';
import { ExtensionAvatar } from '@/components/extensions/ExtensionAvatar';

/* ---------- Layout ---------- */

export function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute bottom-full left-0 right-0 z-30 mb-1">
      <div className="overflow-hidden rounded-lg border border-border bg-panel shadow-2xl">
        {children}
      </div>
    </div>
  );
}

export function SectionHeader({ label }: { label: string }) {
  return (
    <li className="sticky top-0 z-10 border-b border-border/60 bg-panel/95 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-fg-subtle backdrop-blur">
      {label}
    </li>
  );
}

/* ---------- Skill Row ---------- */

interface SkillRowProps {
  skill: LoadedSkill;
  active: boolean;
  dataIdx: number;
  onMouseEnter: () => void;
  onMouseDown: (e: React.MouseEvent) => void;
}

export function SkillRow({
  skill,
  active,
  dataIdx,
  onMouseEnter,
  onMouseDown,
}: SkillRowProps) {
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

/* ---------- Extension Row ---------- */

interface ExtensionRowProps {
  extension: LoadedExtension;
  active: boolean;
  dataIdx: number;
  onMouseEnter: () => void;
  onMouseDown: (e: React.MouseEvent) => void;
}

export function ExtensionRow({
  extension,
  active,
  dataIdx,
  onMouseEnter,
  onMouseDown,
}: ExtensionRowProps) {
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

/* ---------- File Row ---------- */

interface FileRowProps {
  entry: FileSearchEntry;
  active: boolean;
  dataIdx: number;
  onMouseEnter: () => void;
  onMouseDown: (e: React.MouseEvent) => void;
}

export function FileRow({
  entry,
  active,
  dataIdx,
  onMouseEnter,
  onMouseDown,
}: FileRowProps) {
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
