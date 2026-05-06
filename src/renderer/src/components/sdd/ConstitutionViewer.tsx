import { useCallback, useEffect, useRef, useState } from 'react';
import { SddMarkdownContent } from './SddMarkdown';

interface Props {
  entityRootPath: string;
  entityName: string;
  /** mtime (ms) of constitution.md — triggers reload when file changes on disk. */
  constitutionMtime?: number;
}

export function ConstitutionViewer({ entityRootPath, entityName, constitutionMtime }: Props) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const path = `${entityRootPath}/.specify/memory/constitution.md`;
      const text = await window.api.sdd.readArtifact(path);
      setContent(text.replace(/<!--[\s\S]*?-->/g, '').trimStart());
    } catch {
      setContent('_constitution.md not found._');
    } finally {
      setLoading(false);
    }
  }, [entityRootPath]);

  useEffect(() => {
    void load();
  }, [load, constitutionMtime]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3">
        <span className="text-sm font-semibold text-fg">Constitution</span>
        <span className="text-sm text-fg-subtle shrink-0 truncate">{entityName}</span>
      </div>

      {/* Content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden scroll-thin px-3 py-3">
        {loading ? (
          <p className="text-sm text-fg-subtle">Loading…</p>
        ) : (
          <SddMarkdownContent content={content} />
        )}
      </div>
    </div>
  );
}
