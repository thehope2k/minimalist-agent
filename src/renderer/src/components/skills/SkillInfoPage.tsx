import { useState } from 'react';
import { Check, Copy, FolderOpen, Pencil, Sparkles, X } from 'lucide-react';
import { Markdown } from '../chat/parts/markdown/Markdown';
import { SkillAvatar } from './SkillAvatar';
import { SkillMenu } from './SkillMenu';
import { EditSkillDialog, type EditSkillMode } from './EditSkillDialog';
import { revealInFinder } from '@/lib/skills';
import { cn } from '@/lib/utils';
import type { LoadedSkill } from '@/lib/electron';
import type { SeedSubmit } from '@/App';

type Props = {
  skill: LoadedSkill | null;
  onClose?: () => void;
  /** Routes Edit submissions to a fresh chat. */
  onStartChatWithSubmission?: (submit: SeedSubmit) => void;
};

export function SkillInfoPage({
  skill,
  onClose,
  onStartChatWithSubmission,
}: Props) {
  if (!skill) return <EmptyView />;
  return (
    <Body
      skill={skill}
      onClose={onClose}
      onStartChatWithSubmission={onStartChatWithSubmission}
    />
  );
}

function EmptyView() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-fg-subtle">
      <Sparkles className="h-6 w-6" strokeWidth={1.5} />
      <p className="text-sm">Select a skill to view its instructions</p>
    </div>
  );
}

function Body({
  skill,
  onClose,
  onStartChatWithSubmission,
}: {
  skill: LoadedSkill;
  onClose?: () => void;
  onStartChatWithSubmission?: (submit: SeedSubmit) => void;
}) {
  const [editMode, setEditMode] = useState<EditSkillMode | null>(null);
  const mention = `@${skill.slug}`;
  const [copied, setCopied] = useState(false);
  const copyMention = async () => {
    await navigator.clipboard.writeText(mention);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  const handleEdit = (mode: EditSkillMode) => {
    if (!onStartChatWithSubmission) return;
    setEditMode(mode);
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-10 shrink-0 items-center gap-3 border-b border-border px-4">
        <SkillAvatar skill={skill} size="sm" />
        <span className="truncate text-sm font-medium text-fg">
          {skill.metadata.name}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={copyMention}
          title="Copy mention to clipboard"
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-panel/40 px-2 py-1 font-mono text-[11px]',
            copied ? 'text-emerald-300' : 'text-fg-muted hover:bg-elevated hover:text-fg',
          )}
        >
          {copied ? (
            <Check className="h-3 w-3" strokeWidth={2} />
          ) : (
            <Copy className="h-3 w-3" strokeWidth={2} />
          )}{' '}
          {mention}
        </button>
        <SkillMenu skill={skill} variant="header" onAfterDelete={onClose} />
      </header>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[760px] space-y-6 px-6 py-6">
          <PageHeader skill={skill} />

          <Section
            title="Metadata"
            action={
              <EditButton
                onClick={() => handleEdit('metadata')}
                disabled={!onStartChatWithSubmission}
              />
            }
          >
            <KeyValueTable rows={metadataRows(skill)} />
          </Section>

          <Section title="Permission Modes">
            <PermissionModesTable
              alwaysAllow={skill.metadata.alwaysAllow ?? []}
            />
          </Section>

          <Section
            title="Instructions"
            action={
              <EditButton
                onClick={() => handleEdit('instructions')}
                disabled={!onStartChatWithSubmission}
              />
            }
          >
            <div className="markdown px-4 py-4">
              <Markdown text={skill.content} />
            </div>
          </Section>
        </div>
      </div>

      {editMode && (
        <EditSkillDialog
          open
          mode={editMode}
          skill={skill}
          onClose={() => setEditMode(null)}
          onSubmit={(submit) => onStartChatWithSubmission?.(submit)}
        />
      )}
    </div>
  );
}

/* ---------- compound layout primitives ---------- */

function PageHeader({ skill }: { skill: LoadedSkill }) {
  return (
    <div className="flex items-start gap-3">
      <SkillAvatar skill={skill} size="lg" />
      <div className="min-w-0 flex-1">
        <h1 className="text-xl font-semibold text-fg">{skill.metadata.name}</h1>
        <p className="mt-0.5 text-sm text-fg-muted">
          {skill.metadata.description}
        </p>
      </div>
    </div>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-fg">{title}</h2>
        {action}
      </div>
      <div className="overflow-hidden rounded-lg border border-border/50 bg-elevated/20">
        {children}
      </div>
    </section>
  );
}

function EditButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border border-border/60 bg-elevated/60 px-2 py-0.5 text-xs',
        disabled
          ? 'cursor-not-allowed text-fg-subtle opacity-50'
          : 'text-fg-muted hover:bg-elevated hover:text-fg',
      )}
    >
      <Pencil className="h-3 w-3" strokeWidth={1.75} /> Edit
    </button>
  );
}

/* ---------- metadata rows ---------- */

interface KeyValueRow {
  label: string;
  /** Pre-rendered ReactNode so paths can be clickable. */
  value: React.ReactNode;
}

function metadataRows(skill: LoadedSkill): KeyValueRow[] {
  return [
    { label: 'Slug', value: <Mono>{skill.slug}</Mono> },
    { label: 'Name', value: skill.metadata.name },
    { label: 'Description', value: skill.metadata.description },
    {
      label: 'Location',
      value: (
        <button
          type="button"
          onClick={() => void revealInFinder(skill.path)}
          className="inline-flex items-center gap-1 text-fg-muted hover:text-fg"
          title="Reveal in Finder"
        >
          <Mono>{skill.path}</Mono>
          <FolderOpen className="h-3 w-3 shrink-0" strokeWidth={1.75} />
        </button>
      ),
    },
  ];
}

function Mono({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[12.5px]">{children}</span>;
}

function KeyValueTable({ rows }: { rows: KeyValueRow[] }) {
  return (
    <div className="divide-y divide-border/40">
      {rows.map((r) => (
        <div
          key={r.label}
          className="grid grid-cols-[140px_1fr] items-start gap-3 px-4 py-2.5 text-sm"
        >
          <div className="text-fg-subtle">{r.label}</div>
          <div className="min-w-0 break-words text-fg">{r.value}</div>
        </div>
      ))}
    </div>
  );
}

/* ---------- permission modes ---------- */

function PermissionModesTable({ alwaysAllow }: { alwaysAllow: string[] }) {
  const hasList = alwaysAllow.length > 0;
  const rows: Array<{
    mode: string;
    icon: 'check' | 'x' | 'dash';
    text: string;
  }> = [
    {
      mode: 'Plan',
      icon: 'x',
      text: 'Blocked — write tools blocked regardless',
    },
    {
      mode: 'Ask',
      icon: 'check',
      text: 'Auto-approved — no prompts for allowed tools',
    },
    {
      mode: 'Auto',
      icon: 'dash',
      text: 'No effect — all tools already auto-approved',
    },
  ];
  return (
    <div>
      <div className="border-b border-border/40 px-4 py-2 text-xs text-fg-subtle">
        How <span className="text-fg-muted">"Always Allowed Tools"</span>{' '}
        interacts with permission modes
        {hasList && (
          <>
            {' '}
            (this skill: <Mono>{alwaysAllow.join(', ')}</Mono>)
          </>
        )}
        :
      </div>
      <div className="divide-y divide-border/40">
        {rows.map((r) => (
          <div
            key={r.mode}
            className="grid grid-cols-[140px_24px_1fr] items-center gap-3 px-4 py-2.5 text-sm"
          >
            <div className="text-fg-subtle">{r.mode}</div>
            <div className="flex items-center justify-center">
              {r.icon === 'check' && (
                <Check className="h-3.5 w-3.5 text-emerald-400" strokeWidth={2} />
              )}
              {r.icon === 'x' && (
                <X className="h-3.5 w-3.5 text-red-400" strokeWidth={2} />
              )}
              {r.icon === 'dash' && (
                <span className="h-px w-3 bg-fg-subtle" />
              )}
            </div>
            <div className="text-fg-muted">{r.text}</div>
          </div>
        ))}
      </div>
      {!hasList && (
        <div className="border-t border-border/40 bg-elevated/30 px-4 py-2 text-[11px] text-fg-subtle">
          This skill has no <Mono>alwaysAllow</Mono> entries — the table is
          shown for reference. Add tools to the frontmatter to pre-approve
          them under "Ask".
        </div>
      )}
    </div>
  );
}
