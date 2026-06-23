import { useMemo, useState } from 'react';
import { Check, Copy, Plug } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  displayDescription,
  displayName,
  isEnabled,
  setEnabled,
} from '@/lib/extensions';
import { Markdown } from '../chat/parts/markdown/Markdown';
import { Toggle } from '../ui';
import { ExtensionAvatar } from './ExtensionAvatar';
import { ExtensionMenu } from './ExtensionMenu';
import { SecretsSection } from './SecretsSection';
import type { LoadedExtension } from '@/lib/electron';

const VARIANT_LABEL: Record<LoadedExtension['variant'], string> = {
  'guide-only': 'Guide-only',
  'cli-bound': 'CLI-bound',
  'mcp-backed': 'MCP-backed',
};

type Props = {
  extension: LoadedExtension | null;
  onClose: () => void;
};

export function ExtensionInfoPage({ extension, onClose }: Props) {
  if (!extension) {
    return <EmptyView />;
  }

  return (
    <Body extension={extension} onClose={onClose} />
  );
}

function EmptyView() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-fg-subtle">
      <Plug className="h-6 w-6" strokeWidth={1.5} />
      <p className="text-sm">Select an extension to view its details</p>
    </div>
  );
}

function Body({
  extension,
  onClose,
}: {
  extension: LoadedExtension;
  onClose?: () => void;
}) {
  const enabled = isEnabled(extension);
  const configJson = useMemo(
    () => JSON.stringify(extension.config, null, 2),
    [extension.config],
  );
  const [copied, setCopied] = useState(false);

  const copySlug = async () => {
    await navigator.clipboard.writeText(extension.slug);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-10 shrink-0 items-center gap-3 border-b border-border px-4">
        <ExtensionAvatar extension={extension} size="sm" />
        <span className="truncate text-sm font-medium text-fg">
          {displayName(extension)}
        </span>
        <div className="flex-1" />
        <Toggle
          value={enabled}
          onChange={(v) => void setEnabled(extension.slug, v)}
          label={enabled ? 'Disable extension' : 'Enable extension'}
        />
        <span
          className={cn(
            'text-xs font-medium',
            enabled ? 'text-accent' : 'text-fg-subtle',
          )}
        >
          {enabled ? 'Enabled' : 'Disabled'}
        </span>
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
          {extension.slug}
        </button>
        <ExtensionMenu extension={extension} variant="header" onAfterDelete={onClose} />
      </header>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1100px] space-y-6 px-6 py-6">
          <PageHeader extension={extension} />

          {extension.variant === 'mcp-backed' && (
            <div className="rounded-lg border border-border bg-elevated-2 px-4 py-3 text-sm text-fg-muted">
              <strong className="text-fg">MCP-backed.</strong> The MCP server
              is spawned on demand — by the Claude Agent SDK on Anthropic-backed
              sessions, and by the Pi subprocess on Pi-backed sessions — and its
              tools appear to the agent as <code>mcp__{extension.slug}__*</code>.
              A server that fails to start is skipped without blocking the
              session.
            </div>
          )}

          <Section title="Metadata">
            <KeyValueTable rows={metadataRows(extension)} />
          </Section>

          <SecretsSection extension={extension} />

          <Section title="Guide">
            <div className="markdown px-4 py-4">
              <Markdown text={extension.guideBody} />
            </div>
          </Section>

          <Section title="extension.json">
            <div className="px-4 py-3">
              <pre className="scroll-thin overflow-x-auto font-mono text-[12px] leading-relaxed text-fg">
                {configJson}
              </pre>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

/* ---------- compound layout primitives ---------- */

function PageHeader({ extension }: { extension: LoadedExtension }) {
  return (
    <div className="flex items-start gap-3">
      <ExtensionAvatar extension={extension} size="lg" />
      <div className="min-w-0 flex-1">
        <h1 className="text-xl font-semibold text-fg">{displayName(extension)}</h1>
        <p className="mt-0.5 text-sm text-fg-muted">
          {displayDescription(extension)}
        </p>
        <div className="mt-2 inline-block rounded bg-elevated/80 px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-fg-subtle">
          {VARIANT_LABEL[extension.variant]}
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2">
        <h2 className="text-sm font-semibold text-fg">{title}</h2>
      </div>
      <div className="overflow-hidden rounded-lg border border-border/50 bg-elevated/20">
        {children}
      </div>
    </section>
  );
}

/* ---------- metadata rows ---------- */

interface KeyValueRow {
  label: string;
  value: React.ReactNode;
}

function metadataRows(extension: LoadedExtension): KeyValueRow[] {
  const rows: KeyValueRow[] = [
    { label: 'Slug', value: <code className="text-xs">{extension.slug}</code> },
    { label: 'Variant', value: VARIANT_LABEL[extension.variant] },
    { label: 'Path', value: <code className="text-xs break-all">{extension.path}</code> },
  ];

  if (extension.config.version) {
    rows.push({ label: 'Version', value: extension.config.version });
  }

  if (extension.config.tags?.length) {
    rows.push({
      label: 'Tags',
      value: (
        <div className="flex flex-wrap gap-1">
          {extension.config.tags.map((tag) => (
            <span
              key={tag}
              className="rounded bg-elevated px-2 py-0.5 text-xs text-fg"
            >
              {tag}
            </span>
          ))}
        </div>
      ),
    });
  }

  if (extension.config.mcp) {
    const mcp = extension.config.mcp;
    if (mcp.transport === 'stdio') {
      rows.push({
        label: 'MCP command',
        value: (
          <code className="text-xs break-all">
            {[mcp.command, ...(mcp.args ?? [])].join(' ')}
          </code>
        ),
      });
    } else {
      rows.push({
        label: 'MCP URL',
        value: <code className="text-xs break-all">{mcp.url}</code>,
      });
    }
  }

  if (extension.config.env && Object.keys(extension.config.env).length > 0) {
    rows.push({
      label: 'Env keys',
      value: (
        <code className="text-xs">
          {Object.keys(extension.config.env).join(', ')}
        </code>
      ),
    });
  }

  return rows;
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
