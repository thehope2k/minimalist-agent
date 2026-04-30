import { useMemo } from 'react';
import { Plug, X } from 'lucide-react';
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
  if (!extension) return <EmptyState />;
  return <Inner extension={extension} onClose={onClose} />;
}

function Inner({
  extension,
  onClose,
}: {
  extension: LoadedExtension;
  onClose: () => void;
}) {
  const enabled = isEnabled(extension);
  const configJson = useMemo(
    () => JSON.stringify(extension.config, null, 2),
    [extension.config],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <ExtensionAvatar extension={extension} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-base font-medium text-fg">
              {displayName(extension)}
            </h1>
            <span className="rounded bg-elevated/80 px-1.5 py-px font-mono text-[10px] uppercase tracking-wide text-fg-subtle">
              {VARIANT_LABEL[extension.variant]}
            </span>
          </div>
          <p className="truncate text-xs text-fg-subtle">
            {displayDescription(extension)}
          </p>
        </div>
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
        <ExtensionMenu extension={extension} variant="header" />
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-fg-subtle hover:bg-elevated hover:text-fg"
          aria-label="Close"
        >
          <X className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </header>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {extension.variant === 'mcp-backed' && (
          <div className="mx-4 mt-4 rounded-md border border-border/60 bg-elevated/40 px-3 py-2 text-xs text-fg-muted">
            <strong className="text-fg">Anthropic-only.</strong> The MCP
            server is spawned by the Claude Agent SDK; Pi-backed sessions
            will skip this extension. Use a <code>guide-only</code> or{' '}
            <code>cli-bound</code> variant for Pi compatibility.
          </div>
        )}

        <Section title="Metadata">
          <MetaTable extension={extension} />
        </Section>

        <SecretsSection extension={extension} />

        <Section title="Guide">
          <Markdown text={extension.guideBody} />
        </Section>

        <Section title="extension.json">
          <pre className="scroll-thin overflow-x-auto rounded-md border border-border bg-elevated/40 p-3 font-mono text-[12px] leading-relaxed text-fg">
            {configJson}
          </pre>
        </Section>
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
    <section className="border-b border-border/60 px-4 py-4">
      <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">
        {title}
      </h2>
      {children}
    </section>
  );
}

function MetaTable({ extension }: { extension: LoadedExtension }) {
  const rows: Array<[string, React.ReactNode]> = [
    ['Slug', <code className="font-mono">{extension.slug}</code>],
    ['Variant', VARIANT_LABEL[extension.variant]],
    ['Path', <code className="font-mono text-xs">{extension.path}</code>],
  ];
  if (extension.config.version) rows.push(['Version', extension.config.version]);
  if (extension.config.tags?.length) {
    rows.push(['Tags', extension.config.tags.join(', ')]);
  }
  if (extension.config.mcp) {
    const mcp = extension.config.mcp;
    if (mcp.transport === 'stdio') {
      rows.push([
        'MCP command',
        <code className="font-mono text-xs">
          {[mcp.command, ...(mcp.args ?? [])].join(' ')}
        </code>,
      ]);
    } else {
      rows.push([
        'MCP URL',
        <code className="font-mono text-xs">{mcp.url}</code>,
      ]);
    }
  }
  if (extension.config.env && Object.keys(extension.config.env).length > 0) {
    rows.push([
      'Env keys',
      <code className="font-mono text-xs">
        {Object.keys(extension.config.env).join(', ')}
      </code>,
    ]);
  }
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k} className="border-b border-border/30 last:border-b-0">
            <td className="w-32 py-1.5 align-top text-xs text-fg-subtle">
              {k}
            </td>
            <td className="py-1.5 text-fg">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-fg-subtle">
      <div className="flex flex-col items-center gap-2 text-center">
        <Plug className="h-6 w-6" strokeWidth={1.5} />
        <span>Select an extension to see its details.</span>
      </div>
    </div>
  );
}
