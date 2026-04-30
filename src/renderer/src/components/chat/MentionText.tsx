// Render plain user text with inline `@`-mention pills.
//
// Walks the text, splits on the same `@token` pattern the resolver uses,
// and renders each mention as a small chip:
//   - Skill   → SkillAvatar + display name
//   - Folder  → folder icon  + basename (token ends with `/`)
//   - File    → file icon    + basename (token contains `/` or `.`)
//   - Other   → plain `@token` text (probably prose like "ping @joe")
//
// We only need this for user bubbles. Assistant text is rendered through
// Markdown which doesn't contain user-typed mentions.

import { Fragment, useMemo } from 'react';
import { File as FileIcon, Folder as FolderIcon } from 'lucide-react';
import { useSkills } from '@/hooks/useSkills';
import { SkillAvatar } from '../skills/SkillAvatar';
import type { LoadedSkill } from '@/lib/electron';

const MENTION_RE = /(^|\s)@([\w./-]+)/g;

type Run =
  | { kind: 'text'; value: string }
  | { kind: 'mention'; token: string };

function tokenize(text: string): Run[] {
  const out: Run[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  // Reset RE state since it's a global regex with /g.
  MENTION_RE.lastIndex = 0;
  while ((match = MENTION_RE.exec(text)) !== null) {
    const leading = match[1] ?? '';
    const tokenStart = match.index + leading.length;
    if (tokenStart > lastIdx) {
      out.push({ kind: 'text', value: text.slice(lastIdx, tokenStart) });
    }
    out.push({ kind: 'mention', token: match[2]! });
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < text.length) {
    out.push({ kind: 'text', value: text.slice(lastIdx) });
  }
  return out;
}

export function MentionText({ text }: { text: string }) {
  const skills = useSkills() ?? [];
  const bySlug = useMemo(
    () => new Map(skills.map((s) => [s.slug, s])),
    [skills],
  );

  const runs = useMemo(() => tokenize(text), [text]);

  return (
    <>
      {runs.map((r, i) =>
        r.kind === 'text' ? (
          <Fragment key={i}>{r.value}</Fragment>
        ) : (
          <MentionChip key={i} token={r.token} skill={bySlug.get(stripSlash(r.token))} />
        ),
      )}
    </>
  );
}

function stripSlash(token: string): string {
  return token.endsWith('/') ? token.slice(0, -1) : token;
}

function basename(p: string): string {
  const trimmed = stripSlash(p);
  const i = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  return i >= 0 ? trimmed.slice(i + 1) : trimmed;
}

function MentionChip({
  token,
  skill,
}: {
  token: string;
  skill?: LoadedSkill;
}) {
  // Skill match → avatar + display name.
  if (skill) {
    return (
      <span
        className="mx-0.5 inline-flex items-center gap-1 rounded-md border border-border/60 bg-elevated/80 px-1.5 py-px align-baseline text-[0.9em] text-fg"
        title={`@${skill.slug}`}
      >
        <SkillAvatar skill={skill} size="sm" className="!h-3.5 !w-3.5 !text-[10px]" />
        <span>{skill.metadata.name}</span>
      </span>
    );
  }

  const isFolder = token.endsWith('/');
  const isPath = isFolder || token.includes('/') || token.includes('.');

  if (!isPath) {
    // Looks like prose ("ping @joe"). Render literally.
    return <span>@{token}</span>;
  }

  const Icon = isFolder ? FolderIcon : FileIcon;
  return (
    <span
      className="mx-0.5 inline-flex items-center gap-1 rounded-md border border-border/60 bg-elevated/80 px-1.5 py-px align-baseline text-[0.9em] text-fg"
      title={`@${token}`}
    >
      <Icon className="h-3 w-3 text-fg-muted" strokeWidth={1.75} />
      <span>{basename(token)}</span>
    </span>
  );
}
