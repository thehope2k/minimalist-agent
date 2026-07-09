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
import { useSessionAssets } from '@/hooks/useSessionAssets';
import { displayName as extensionDisplayName } from '@/lib/extensions';
import { SkillAvatar } from '../skills/SkillAvatar';
import { ExtensionAvatar } from '../extensions/ExtensionAvatar';
import type { LoadedExtension, LoadedSkill } from '@/lib/electron';

// Two token forms are supported:
//   Plain:   @src/utils.ts  (no whitespace in path)
//   Quoted:  @`My Folder/file.ts`  (backtick-quoted when path contains spaces)
// Both are inserted by the mention picker; the quoted form keeps the token
// unambiguous because whitespace normally terminates a token.
const MENTION_RE = /(^|\s)@(`[^`]+`|[\w./-]+)/g;

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
  const { skills, extensions } = useSessionAssets();
  const skillBySlug = useMemo(
    () => new Map(skills.map((s) => [s.slug, s])),
    [skills],
  );
  const extensionBySlug = useMemo(
    () => new Map(extensions.map((e) => [e.slug, e])),
    [extensions],
  );

  const runs = useMemo(() => tokenize(text), [text]);

  return (
    <>
      {runs.map((r, i) =>
        r.kind === 'text' ? (
          <Fragment key={i}>{r.value}</Fragment>
        ) : (
          <MentionChip
            key={i}
            token={r.token}
            skill={skillBySlug.get(stripSlash(stripBackticks(r.token)))}
            extension={extensionBySlug.get(stripSlash(stripBackticks(r.token)))}
          />
        ),
      )}
    </>
  );
}

function stripBackticks(token: string): string {
  return token.startsWith('`') && token.endsWith('`') ? token.slice(1, -1) : token;
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
  extension,
}: {
  token: string;
  skill?: LoadedSkill;
  extension?: LoadedExtension;
}) {
  // Normalise the token: remove backtick quoting so the rest of the
  // component always works with the bare path string.
  const rawToken = stripBackticks(token);
  // Skill takes priority over extension on slug collision — matches the
  // backend resolution rules in `parseMentions` / `resolveMentions`.
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
  if (extension) {
    return (
      <span
        className="mx-0.5 inline-flex items-center gap-1 rounded-md border border-border/60 bg-elevated/80 px-1.5 py-px align-baseline text-[0.9em] text-fg"
        title={`@${extension.slug}`}
      >
        <ExtensionAvatar
          extension={extension}
          size="sm"
          className="!h-3.5 !w-3.5 !text-[10px]"
        />
        <span>{extensionDisplayName(extension)}</span>
      </span>
    );
  }

  const isFolder = rawToken.endsWith('/');
  const isPath = isFolder || rawToken.includes('/') || rawToken.includes('.');

  if (!isPath) {
    // Looks like prose ("ping @joe"). Render literally.
    return <span>@{rawToken}</span>;
  }

  const Icon = isFolder ? FolderIcon : FileIcon;
  return (
    <span
      className="mx-0.5 inline-flex items-center gap-1 rounded-md border border-border/60 bg-elevated/80 px-1.5 py-px align-baseline text-[0.9em] text-fg"
      title={`@${rawToken}`}
    >
      <Icon className="h-3 w-3 text-fg-muted" strokeWidth={1.75} />
      <span>{basename(rawToken)}</span>
    </span>
  );
}
