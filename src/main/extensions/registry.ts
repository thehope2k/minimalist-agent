import { EventEmitter } from 'node:events';
import {
  invalidateExtensionsCache,
  loadAllExtensions,
  loadExtensionBySlug,
} from './storage';
import { type LoadedExtension } from './types';

/**
 * In-memory authority on extension state. Tiny by design — Skills works
 * without one, and we only add this much because future modules (MCP pool,
 * prompt injection, IPC change events) need a stable subscription point.
 *
 * No lifecycle FSM. Presence in the folder = active.
 */
export class ExtensionRegistry extends EventEmitter {
  private items = new Map<string, LoadedExtension>();
  private loaded = false;

  load(): void {
    invalidateExtensionsCache();
    // Registry manages user-tier only (~/.minimalist-agent/extensions/).
    // Project-tier extensions are loaded dynamically per session CWD.
    const all = loadAllExtensions();
    this.items.clear();
    for (const ext of all) this.items.set(ext.slug, ext);
    this.loaded = true;
    this.emit('changed');
  }

  reload(slug: string): LoadedExtension | null {
    invalidateExtensionsCache();
    const ext = loadExtensionBySlug(slug);
    if (ext) {
      this.items.set(slug, ext);
      this.emit('changed', { slug });
    } else {
      const had = this.items.delete(slug);
      if (had) this.emit('changed', { slug });
    }
    return ext;
  }

  ensureLoaded(): void {
    if (!this.loaded) this.load();
  }

  list(): LoadedExtension[] {
    this.ensureLoaded();
    return Array.from(this.items.values()).sort((a, b) =>
      a.slug.localeCompare(b.slug),
    );
  }

  get(slug: string): LoadedExtension | undefined {
    this.ensureLoaded();
    return this.items.get(slug);
  }

  onChanged(handler: (payload?: { slug: string }) => void): () => void {
    this.on('changed', handler);
    return () => this.off('changed', handler);
  }
}

let singleton: ExtensionRegistry | null = null;

export function getExtensionRegistry(): ExtensionRegistry {
  if (!singleton) singleton = new ExtensionRegistry();
  return singleton;
}
