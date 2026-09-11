// One-line summaries for tool calls, shown next to the tool name in the
// collapsed chip. Falls back to a generic best-effort string for tools we
// don't recognize.
//
// Kept deliberately small: each branch returns a *short* string (we'll
// truncate visually with `truncate`); no input echoing back of huge blobs.

import type { LucideIcon } from 'lucide-react';
import {
  Bot,
  FileText,
  FilePenLine,
  FolderTree,
  Globe,
  Hammer,
  ListChecks,
  Search,
  SquareTerminal,
} from 'lucide-react';
import { relativeToCwd } from './path';

const MAX_SUMMARY = 120;

function clip(s: string, n = MAX_SUMMARY): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + '…';
}

function asObj(input: unknown): Record<string, unknown> | null {
  return input && typeof input === 'object' ? (input as Record<string, unknown>) : null;
}

// Bash calls almost always lead with a `cd <same project dir> && ` boilerplate
// prefix (the agent re-asserts cwd every call). Since `clip()` truncates from
// the tail, that identical prefix was eating the whole visible width and
// hiding the one part of the command that actually differs row to row.
function stripCdPrefix(cmd: string): string {
  return cmd.replace(/^cd\s+(?:'[^']*'|"[^"]*"|\S+)\s*&&\s*/, '');
}

/** Normalise tool-name casing and aliases before matching them below. */
export function canonicalToolName(name: string): string {
  switch (name.toLowerCase()) {
    case 'read': return 'Read';
    case 'write': return 'Write';
    case 'edit': return 'Edit';
    case 'notebookedit': return 'NotebookEdit';
    case 'todowrite': return 'TodoWrite';
    case 'bash': return 'Bash';
    case 'grep': return 'Grep';
    case 'glob': return 'Glob';
    case 'webfetch':
    case 'web_fetch': return 'WebFetch';
    case 'websearch':
    case 'web_search': return 'WebSearch';
    case 'task':
    case 'agent': return 'Agent';
    default: return name;
  }
}

/** Return a one-line summary, or an empty string when none is useful. */
export function summarizeToolCall(name: string, input: unknown, cwd?: string): string {
  const o = asObj(input) ?? {};

  switch (canonicalToolName(name)) {
    case 'Read': {
      const p = typeof o.file_path === 'string' ? relativeToCwd(o.file_path, cwd) : '';
      const offset = typeof o.offset === 'number' ? o.offset : null;
      const limit = typeof o.limit === 'number' ? o.limit : null;
      if (!p) return '';
      const range = offset != null
        ? `:${offset}${limit != null ? `-${offset + limit}` : ''}`
        : '';
      return clip(p + range);
    }

    case 'Write': {
      const p = typeof o.file_path === 'string' ? relativeToCwd(o.file_path, cwd) : '';
      return clip(p);
    }

    case 'Edit': {
      const p = typeof o.file_path === 'string' ? relativeToCwd(o.file_path, cwd) : '';
      const replaceAll = o.replace_all === true;
      return clip(replaceAll ? `${p} (replace all)` : p);
    }

    case 'NotebookEdit': {
      const p = typeof o.notebook_path === 'string' ? relativeToCwd(o.notebook_path, cwd) : '';
      return clip(p);
    }

    case 'Bash': {
      const cmd = typeof o.command === 'string' ? stripCdPrefix(o.command.replace(/\s+/g, ' ')) : '';
      return clip(cmd);
    }

    case 'BashOutput': {
      const id = typeof o.bash_id === 'string' ? o.bash_id : '';
      return clip(`bg ${id}`);
    }

    case 'KillShell': {
      const id = typeof o.shell_id === 'string' ? o.shell_id : '';
      return clip(`kill ${id}`);
    }

    case 'Glob': {
      const pattern = typeof o.pattern === 'string' ? o.pattern : '';
      const path = typeof o.path === 'string' ? relativeToCwd(o.path, cwd) : '';
      return clip(path ? `${pattern} in ${path}` : pattern);
    }

    case 'Grep': {
      const pattern = typeof o.pattern === 'string' ? o.pattern : '';
      const path = typeof o.path === 'string' ? relativeToCwd(o.path, cwd) : '';
      const glob = typeof o.glob === 'string' ? ` (${o.glob})` : '';
      return clip(`"${pattern}"${path ? ' in ' + path : ''}${glob}`);
    }

    case 'WebFetch': {
      const url = typeof o.url === 'string' ? o.url : '';
      try {
        const u = new URL(url);
        return clip(u.host + u.pathname);
      } catch {
        return clip(url);
      }
    }

    case 'WebSearch': {
      const q = typeof o.query === 'string' ? o.query : '';
      return clip(`"${q}"`);
    }

    case 'TodoWrite': {
      const todos = Array.isArray(o.todos) ? (o.todos as unknown[]) : [];
      return clip(`${todos.length} item${todos.length === 1 ? '' : 's'}`);
    }

    case 'Task':
    case 'Agent': {
      const desc = typeof o.description === 'string'
        ? o.description
        : (typeof o.task === 'string' ? o.task : '');
      const sub = typeof o.subagent_type === 'string'
        ? o.subagent_type
        : (typeof o.agent === 'string' ? o.agent : '');
      return clip(sub ? `${sub}: ${desc}` : desc);
    }

    case 'ExitPlanMode': {
      const plan = typeof o.plan === 'string' ? o.plan.split('\n')[0] : '';
      return clip(plan);
    }

    default: {
      // MCP-style names ("mcp__server__tool") — show the trailing tool name.
      // For everything else, surface the most identifying string field.
      const obvious = ['command', 'file_path', 'path', 'pattern', 'url', 'query', 'name', 'id'];
      for (const k of obvious) {
        if (typeof o[k] === 'string') return clip(o[k] as string);
      }
      const keys = Object.keys(o).slice(0, 3);
      return keys.length ? clip(keys.join(', ')) : '';
    }
  }
}

/**
 * Pick a small icon to show next to the tool name. Defaults to the
 * generic wrench so we never blank-frame a chip.
 */
export function iconForTool(name: string): LucideIcon {
  switch (canonicalToolName(name)) {
    case 'Read':
    case 'NotebookEdit':
      return FileText;
    case 'Write':
    case 'Edit':
      return FilePenLine;
    case 'Bash':
    case 'BashOutput':
    case 'KillShell':
      return SquareTerminal;
    case 'Grep':
    case 'Glob':
      return Search;
    case 'WebFetch':
    case 'WebSearch':
      return Globe;
    case 'TodoWrite':
      return ListChecks;
    case 'Task':
    case 'Agent':
      return Bot;
    case 'ExitPlanMode':
      return FolderTree;
    default:
      return Hammer;
  }
}

/**
 * Optional 1-line *result* summary (e.g. "12 matches", "847 bytes").
 * Returns '' if we can't synthesize one — the caller falls back to
 * showing the status icon alone.
 */
export function summarizeToolResult(
  name: string,
  result: { content: string; isError?: boolean } | undefined,
): string {
  if (!result || result.isError) return '';
  const text = result.content;
  if (!text) return '';

  switch (canonicalToolName(name)) {
    case 'Grep': {
      // Common rg / Grep-tool patterns: "Found N matches" or "N: file:line".
      const m = text.match(/Found (\d+) match/i);
      if (m) return `${m[1]} match${m[1] === '1' ? '' : 'es'}`;
      const lines = text.split('\n').filter((l) => l.trim()).length;
      if (lines > 0) return `${lines} line${lines === 1 ? '' : 's'}`;
      return '';
    }
    case 'Glob': {
      const lines = text.split('\n').filter((l) => l.trim()).length;
      return lines ? `${lines} file${lines === 1 ? '' : 's'}` : '';
    }
    case 'Read': {
      const lines = text.split('\n').length;
      return `${lines} line${lines === 1 ? '' : 's'}`;
    }
    case 'Bash': {
      const bytes = text.length;
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    }
    default:
      return '';
  }
}
