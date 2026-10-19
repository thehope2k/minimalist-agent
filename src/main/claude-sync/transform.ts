import matter from 'gray-matter';
import type { LoadedSkill } from '../skills/types';
import type { LoadedAgent } from '../agents/types';
import type { EnvValue, LoadedExtension } from '../extensions/types';
import { isInputRef, isSecretRef, isPlaceholderValue } from '../extensions/types';

export function toClaudeName(slug: string): string {
  return (
    slug
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 64) || 'unnamed'
  );
}

// `ls` has no Claude counterpart; Glob covers listing.
const TOOL_MAP: Record<string, string> = {
  read: 'Read',
  write: 'Write',
  edit: 'Edit',
  bash: 'Bash',
  grep: 'Grep',
  find: 'Glob',
  glob: 'Glob',
  ls: 'Glob',
  web_fetch: 'WebFetch',
  webfetch: 'WebFetch',
  web_search: 'WebSearch',
  websearch: 'WebSearch',
  agent: 'Task',
  task: 'Task',
  todowrite: 'TodoWrite',
};

export function mapTools(tools: string[] | undefined): { mapped: string[]; dropped: string[] } {
  const mapped: string[] = [];
  const dropped: string[] = [];
  for (const tool of tools ?? []) {
    const claude = TOOL_MAP[tool.toLowerCase()];
    if (!claude) dropped.push(tool);
    else if (!mapped.includes(claude)) mapped.push(claude);
  }
  return { mapped, dropped };
}

const MA_ONLY_PATTERNS: Array<[RegExp, string]> = [
  [/\bbrowser_tool\b/, 'browser_tool'],
  [/\bweb_fetch\b/, 'web_fetch (Claude: WebFetch)'],
  [/\bweb_search\b/, 'web_search (Claude: WebSearch)'],
  [/\bRequest(Approval|Decision|Feedback|Guidance|Preference)\b/, 'collaboration tools'],
  [/\b(CreatePlan|UpdatePlan|CompletePhase)\b/, 'planning tools'],
  [/(^|\s)@[a-z0-9][a-z0-9-]*\b/m, '@-mentions'],
];

export function maOnlyReferences(text: string): string[] {
  return MA_ONLY_PATTERNS.filter(([re]) => re.test(text)).map(([, label]) => label);
}

export interface Converted {
  name: string;
  /** For MCP servers, the JSON passed to `claude mcp add-json`. */
  content: string;
  warnings: string[];
}

export function convertSkill(skill: LoadedSkill): Converted {
  const { mapped, dropped } = mapTools(skill.metadata.alwaysAllow);
  const data: Record<string, unknown> = {
    name: toClaudeName(skill.slug),
    description: skill.metadata.description,
  };
  if (mapped.length > 0) data['allowed-tools'] = mapped.join(', ');
  const warnings = maOnlyReferences(skill.content).map((r) => `uses ${r}`);
  if (dropped.length > 0)
    warnings.push(`no Claude equivalent for allowed tool(s): ${dropped.join(', ')}`);
  return { name: data.name as string, content: matter.stringify(skill.content, data), warnings };
}

export function convertAgent(agent: LoadedAgent): Converted {
  const { mapped, dropped } = mapTools(agent.metadata.tools);
  const data: Record<string, unknown> = {
    name: toClaudeName(agent.slug),
    description: agent.metadata.description,
  };
  if (mapped.length > 0) data.tools = mapped.join(', ');
  if (agent.metadata.model) data.model = agent.metadata.model;
  const warnings = maOnlyReferences(agent.content).map((r) => `uses ${r}`);
  if (dropped.length > 0) warnings.push(`no Claude equivalent for tool(s): ${dropped.join(', ')}`);
  return { name: data.name as string, content: matter.stringify(agent.content, data), warnings };
}

export function convertGuide(ext: LoadedExtension, envNames: string[]): Converted {
  const body = [
    ext.guideBody.trim(),
    envNames.length > 0
      ? `\n## Environment\n\nThis integration reads these environment variables: ${envNames
          .map((n) => `\`${n}\``)
          .join(', ')}.`
      : '',
  ]
    .join('\n')
    .trim();
  const data = {
    name: toClaudeName(ext.slug),
    description: ext.guideFrontmatter.description || ext.config.description,
  };
  return {
    name: data.name,
    content: matter.stringify(`${body}\n`, data),
    warnings: maOnlyReferences(body).map((r) => `uses ${r}`),
  };
}

export type EnvResolution = { kind: 'value'; value: string; secret: boolean } | { kind: 'missing' };

export function resolveForClaude(
  value: EnvValue,
  lookup: {
    secret: (k: string) => string | null | undefined;
    input: (k: string) => string | null | undefined;
  },
): EnvResolution {
  if (isSecretRef(value)) {
    const v = lookup.secret(value.secret);
    return v ? { kind: 'value', value: v, secret: true } : { kind: 'missing' };
  }
  if (isInputRef(value)) {
    const v = lookup.input(value.input);
    return v ? { kind: 'value', value: v, secret: false } : { kind: 'missing' };
  }
  if (isPlaceholderValue(value)) return { kind: 'missing' };
  // `${VAR}` passes through: Claude Code expands it from its own environment.
  return { kind: 'value', value, secret: false };
}

export type McpConversion =
  | { ok: true; converted: Converted; usesSecrets: boolean }
  | { ok: false; reason: string; usesSecrets: boolean };

export function convertMcp(
  ext: LoadedExtension,
  env: Record<string, EnvResolution>,
  includeSecrets: boolean,
): McpConversion {
  const mcp = ext.config.mcp;
  const name = toClaudeName(ext.slug);
  const usesSecrets = Object.values(env).some((e) => e.kind === 'value' && e.secret);
  if (!mcp) return { ok: false, reason: 'not an MCP extension', usesSecrets };
  if (mcp.transport !== 'stdio') {
    if (mcp.auth) {
      return {
        ok: false,
        reason: "signs in through MA's connection; Claude can't reuse it",
        usesSecrets,
      };
    }
    return {
      ok: true,
      usesSecrets: false,
      converted: {
        name,
        content: JSON.stringify({
          type: mcp.transport,
          url: mcp.url,
          ...(mcp.headers ? { headers: mcp.headers } : {}),
        }),
        warnings: [],
      },
    };
  }
  const out: Record<string, string> = {};
  if (mcp.envFromBinding) {
    for (const [key, res] of Object.entries(env)) {
      if (res.kind === 'missing') {
        return { ok: false, reason: `setup value ${key} isn't filled in yet in MA`, usesSecrets };
      }
      if (res.secret && !includeSecrets) {
        return {
          ok: false,
          reason: 'needs a secret (turn on "Include secrets" to sync it)',
          usesSecrets,
        };
      }
      out[key] = res.value;
    }
  }
  return {
    ok: true,
    usesSecrets,
    converted: {
      name,
      content: JSON.stringify({
        type: 'stdio',
        command: mcp.command,
        args: mcp.args ?? [],
        ...(Object.keys(out).length > 0 ? { env: out } : {}),
      }),
      warnings: [],
    },
  };
}
