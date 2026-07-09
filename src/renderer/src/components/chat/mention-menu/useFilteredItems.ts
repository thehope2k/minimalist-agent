import { useEffect, useMemo, useState } from 'react';
import type { FileSearchEntry, LoadedExtension, LoadedSkill } from '@/lib/electron';
import { scoreEntry, searchFiles } from '@/lib/files';
import { scoreSkill, scoreExtension } from './scoring';
import type { MentionItem } from './types';
import { FILES_LIMIT, FILE_SEARCH_DEBOUNCE_MS } from './types';

interface UseFilteredItemsParams {
  open: boolean;
  query: string;
  skills: LoadedSkill[];
  extensions: LoadedExtension[];
  cwd?: string;
}

/**
 * Filters and scores skills, extensions, and files based on query.
 * Handles debounced file search via IPC.
 */
export function useFilteredItems({
  open,
  query,
  skills,
  extensions,
  cwd,
}: UseFilteredItemsParams) {
  const [files, setFiles] = useState<FileSearchEntry[]>([]);

  /* ---------- skill scoring ---------- */
  const filteredSkills = useMemo(() => {
    const q = query.trim().toLowerCase();
    const ranked = skills
      .map((s) => ({
        skill: s,
        score: scoreSkill(s, q),
        tier: s.source === 'project' ? 0 : 1,
      }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.tier - b.tier);
    return ranked.map((r) => r.skill);
  }, [skills, query]);

  /* ---------- extension scoring ---------- */
  const filteredExtensions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return extensions
      .map((e) => ({ extension: e, score: scoreExtension(e, q), tier: e.scope === 'project' ? 0 : 1 }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.tier - b.tier)
      .map((r) => r.extension);
  }, [extensions, query]);

  /* ---------- file search (debounced IPC) ---------- */
  useEffect(() => {
    if (!open || !cwd) {
      setFiles([]);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      void searchFiles(cwd, query, FILES_LIMIT).then((res) => {
        if (!cancelled) setFiles(res);
      });
    }, FILE_SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [open, cwd, query]);

  const filteredFiles = useMemo(() => {
    if (!query.trim()) return files.slice(0, FILES_LIMIT);
    return files
      .map((e) => ({ entry: e, score: scoreEntry(e, query) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, FILES_LIMIT)
      .map((x) => x.entry);
  }, [files, query]);

  /* ---------- flat selectable list (skips section headers) ---------- */
  const items: MentionItem[] = useMemo(() => {
    return [
      ...filteredSkills.map((skill) => ({ kind: 'skill', skill }) as const),
      ...filteredExtensions.map(
        (extension) => ({ kind: 'extension', extension }) as const,
      ),
      ...filteredFiles.map((entry) => ({ kind: 'file', entry }) as const),
    ];
  }, [filteredSkills, filteredExtensions, filteredFiles]);

  return {
    filteredSkills,
    filteredExtensions,
    filteredFiles,
    items,
  };
}
