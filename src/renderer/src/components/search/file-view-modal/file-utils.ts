import type { ViewerType } from './types';
import { MD_EXTS, SVG_EXTS, RASTER_EXTS, JSON_EXTS, HTML_EXTS } from './types';

export function basename(p: string): string {
  return p.split('/').pop() ?? p;
}

export function extname(p: string): string {
  const base = basename(p);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot) : '';
}

export function getViewerType(path: string): ViewerType {
  const ext = extname(path).toLowerCase();
  if (MD_EXTS.has(ext)) return 'markdown';
  if (SVG_EXTS.has(ext)) return 'image-svg';
  if (RASTER_EXTS.has(ext)) return 'image-raster';
  if (JSON_EXTS.has(ext)) return 'json';
  if (HTML_EXTS.has(ext)) return 'html';
  return 'code';
}

export function getMimeType(path: string): string {
  const ext = extname(path).toLowerCase();
  const MAP: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.bmp': 'image/bmp',
    '.ico': 'image/x-icon',
  };
  return MAP[ext] ?? 'image/png';
}

export function getMonacoLanguage(path: string): string {
  const ext = extname(path).toLowerCase();
  const MAP: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.mts': 'typescript',
    '.cts': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.mjs': 'javascript',
    '.cjs': 'javascript',
    '.json': 'json',
    '.jsonc': 'json',
    '.css': 'css',
    '.scss': 'scss',
    '.less': 'less',
    '.html': 'html',
    '.htm': 'html',
    '.xml': 'xml',
    '.svg': 'xml',
    '.md': 'markdown',
    '.mdx': 'markdown',
    '.py': 'python',
    '.sh': 'shell',
    '.bash': 'shell',
    '.zsh': 'shell',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.toml': 'ini',
    '.ini': 'ini',
    '.env': 'ini',
    '.rs': 'rust',
    '.go': 'go',
    '.java': 'java',
    '.kt': 'kotlin',
    '.swift': 'swift',
    '.c': 'c',
    '.h': 'c',
    '.cpp': 'cpp',
    '.cc': 'cpp',
    '.hpp': 'cpp',
    '.cs': 'csharp',
    '.rb': 'ruby',
    '.php': 'php',
    '.sql': 'sql',
    '.graphql': 'graphql',
    '.gql': 'graphql',
    '.dockerfile': 'dockerfile',
    '.tf': 'hcl',
    '.hcl': 'hcl',
  };
  return MAP[ext] ?? 'plaintext';
}
