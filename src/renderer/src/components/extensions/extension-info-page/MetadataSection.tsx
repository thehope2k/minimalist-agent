import type { LoadedExtension } from '@/lib/electron';
import { KeyValueTable, Section } from './shared';
import type { KeyValueRow } from './types';

export function MetadataSection({ extension }: { extension: LoadedExtension }) {
  return (
    <Section title="Metadata">
      <KeyValueTable rows={buildMetadataRows(extension)} />
    </Section>
  );
}

function buildMetadataRows(extension: LoadedExtension): KeyValueRow[] {
  const rows: KeyValueRow[] = [
    { label: 'Slug', value: <code className="text-xs">{extension.slug}</code> },
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
    rows.push(
      mcp.transport === 'stdio'
        ? {
            label: 'MCP command',
            value: (
              <code className="text-xs break-all">
                {[mcp.command, ...(mcp.args ?? [])].join(' ')}
              </code>
            ),
          }
        : {
            label: 'MCP URL',
            value: <code className="text-xs break-all">{mcp.url}</code>,
          },
    );

    const blockedTools = extension.config.permissions?.blockedTools;
    if (blockedTools?.length) {
      rows.push({
        label: 'Blocked tools',
        value: (
          <div className="flex flex-wrap gap-1">
            {blockedTools.map((tool) => (
              <code
                key={tool}
                className="rounded bg-amber-500/15 px-2 py-0.5 text-xs text-amber-300"
              >
                {tool}
              </code>
            ))}
          </div>
        ),
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
