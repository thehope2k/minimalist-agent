export interface FileViewModalProps {
  absolutePath: string;
  /** 1-based line to scroll to (grep results). 1 = top. */
  lineNumber: number;
  onClose: () => void;
}

export type ViewerType =
  | 'markdown'
  | 'image-raster'
  | 'image-svg'
  | 'json'
  | 'html'
  | 'code';

// Extension sets
export const MD_EXTS = new Set(['.md', '.mdx']);
export const SVG_EXTS = new Set(['.svg']);
export const RASTER_EXTS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.avif',
  '.bmp',
  '.ico',
]);
export const JSON_EXTS = new Set(['.json', '.jsonc']);
export const HTML_EXTS = new Set(['.html', '.htm']);
