import { useState } from 'react';
import { Bot, Check, Copy, Pencil } from 'lucide-react';
import { Markdown } from '../chat/parts/markdown/Markdown';
import { AgentAvatar } from './AgentAvatar';
import { AgentMenu } from './AgentMenu';
import { EditAgentDialog, type EditAgentMode } from './EditAgentDialog';
import { cn } from '@/lib/utils';
import type { LoadedAgent } from '@/lib/electron';
import type { SeedSubmit } from '@/App';

type Props = {
  agent: LoadedAgent | null;
  onClose: () => void;
  onStartChatWithSubmission?: (submit: SeedSubmit) => void;
};

export function AgentInfoPage({
  agent,
  onClose,
  onStartChatWithSubmission,
}: Props) {
  if (!agent) {
    return <EmptyView />;
  }

  return (
    <Body
      agent={agent}
      onClose={onClose}
      onStartChatWithSubmission={onStartChatWithSubmission}
    />
  );
}

function EmptyView() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-fg-subtle">
      <Bot className="h-6 w-6" strokeWidth={1.5} />
      <p className="text-sm">Select an agent to view its details</p>
    </div>
  );
}

function Body({
  agent,
  onClose,
  onStartChatWithSubmission,
}: {
  agent: LoadedAgent;
  onClose?: () => void;
  onStartChatWithSubmission?: (submit: SeedSubmit) => void;
}) {
  const [editMode, setEditMode] = useState<EditAgentMode | null>(null);
  const [copied, setCopied] = useState(false);

  const copySlug = async () => {
    await navigator.clipboard.writeText(agent.slug);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleEdit = (mode: EditAgentMode) => {
    if (!onStartChatWithSubmission) return;
    setEditMode(mode);
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-10 shrink-0 items-center gap-3 border-b border-border px-4">
        <AgentAvatar agent={agent} size="sm" />
        <span className="truncate text-sm font-medium text-fg">
          {agent.metadata.name}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={copySlug}
          title="Copy slug to clipboard"
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
          {agent.slug}
        </button>
        <AgentMenu agent={agent} variant="header" onAfterDelete={onClose} />
      </header>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1100px] space-y-6 px-6 py-6">
          <PageHeader agent={agent} />

          <Section
            title="Metadata"
            action={
              <EditButton
                onClick={() => handleEdit('metadata')}
                disabled={!onStartChatWithSubmission}
              />
            }
          >
            <KeyValueTable rows={metadataRows(agent)} />
          </Section>

          <Section title="Tools & Limits">
            <ToolsAndLimits agent={agent} />
          </Section>

          <Section
            title="System Prompt"
            action={
              <EditButton
                onClick={() => handleEdit('instructions')}
                disabled={!onStartChatWithSubmission}
              />
            }
          >
            <div className="markdown px-4 py-4">
              <Markdown text={agent.content} />
            </div>
          </Section>
        </div>
      </div>

      {editMode && (
        <EditAgentDialog
          open
          mode={editMode}
          agent={agent}
          onClose={() => setEditMode(null)}
          onSubmit={(submit) => onStartChatWithSubmission?.(submit)}
        />
      )}
    </div>
  );
}

/* ---------- compound layout primitives ---------- */

function PageHeader({ agent }: { agent: LoadedAgent }) {
  return (
    <div className="flex items-start gap-3">
      <AgentAvatar agent={agent} size="lg" />
      <div className="min-w-0 flex-1">
        <h1 className="text-xl font-semibold text-fg">{agent.metadata.name}</h1>
        <p className="mt-0.5 text-sm text-fg-muted">
          {agent.metadata.description}
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
  value: React.ReactNode;
}

function metadataRows(agent: LoadedAgent): KeyValueRow[] {
  return [
    { label: 'Name', value: agent.metadata.name },
    { label: 'Slug', value: <code className="text-xs">{agent.slug}</code> },
    {
      label: 'Description',
      value: agent.metadata.description || <span className="text-fg-subtle">—</span>,
    },
    {
      label: 'Model',
      value: agent.metadata.model || <span className="text-fg-subtle">default</span>,
    },
  ];
}

function KeyValueTable({ rows }: { rows: KeyValueRow[] }) {
  return (
    <div className="divide-y divide-border/40">
      {rows.map((row, i) => (
        <div key={i} className="flex gap-3 px-4 py-2.5">
          <div className="w-28 shrink-0 text-xs font-medium text-fg-subtle">
            {row.label}
          </div>
          <div className="min-w-0 flex-1 text-sm text-fg">{row.value}</div>
        </div>
      ))}
    </div>
  );
}

function ToolsAndLimits({ agent }: { agent: LoadedAgent }) {
  const tools = agent.metadata.tools || [];
  const maxTurns = agent.metadata.maxTurns;
  const permissionMode = agent.metadata.permissionMode;
  const effort = agent.metadata.effort;

  return (
    <div className="space-y-3 px-4 py-3">
      <div>
        <div className="mb-1.5 text-xs font-medium text-fg-subtle">Tools</div>
        {tools.length === 0 ? (
          <div className="text-sm text-fg-muted">All available tools</div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {tools.map((t) => (
              <span
                key={t}
                className="rounded bg-elevated px-2 py-0.5 font-mono text-xs text-fg"
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </div>

      {(maxTurns || permissionMode || effort) && (
        <div>
          <div className="mb-1.5 text-xs font-medium text-fg-subtle">Limits & Config</div>
          <div className="space-y-1 text-sm text-fg-muted">
            {maxTurns && (
              <div>
                Max turns: <span className="text-fg">{maxTurns}</span>
              </div>
            )}
            {permissionMode && (
              <div>
                Permission mode: <span className="text-fg">{permissionMode}</span>
              </div>
            )}
            {effort && (
              <div>
                Effort: <span className="text-fg">{effort}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
