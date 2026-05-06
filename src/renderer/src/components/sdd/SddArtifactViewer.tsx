import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SddFeature, SddPhase } from '@/lib/sdd';
import { taskProgress } from '@/lib/sdd';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import React from 'react';

interface Props {
  feature: SddFeature;
  entityRootPath: string;
  /** mtime (ms) of constitution.md, for stale-detection in the constitution tab. */
  constitutionMtime?: number;
  onClose: () => void;
}

/**
 * For each phase, open the tab the user actually wants to READ at that point:
 * - constitution / specify → constitution (context before writing spec)
 * - plan → spec (review spec before planning)
 * - tasks → plan (review plan before generating tasks)
 * - implement / complete → tasks (work through / review task checklist)
 */
const PHASE_DEFAULT_TAB: Record<SddPhase, string> = {
  constitution: 'constitution',
  specify:      'constitution',
  plan:         'spec',
  tasks:        'plan',
  implement:    'tasks',
  complete:     'tasks',
};

// ── Text extraction ───────────────────────────────────────────────────────────

/**
 * Recursively extract plain text from a React node tree.
 * String(children) produces "[object Object]" for element arrays — this
 * gives the real concatenated text so STOP/Given/When/Then patterns work
 * on paragraphs with inline bold, em, code, etc.
 */
function extractText(node: React.ReactNode): string {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number' || typeof node === 'boolean') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (React.isValidElement(node)) {
    return extractText((node.props as { children?: React.ReactNode }).children);
  }
  return '';
}

export function SddArtifactViewer({ feature, entityRootPath, constitutionMtime, onClose }: Props) {
  // Unique ID scopes the checkbox DOM query to this viewer instance,
  // preventing index collisions if two viewers are ever mounted at once.
  const viewerIdRef = useRef(`sdd-viewer-${Math.random().toString(36).slice(2)}`);
  const [activeTab, setActiveTab] = useState<string>(
    PHASE_DEFAULT_TAB[feature.currentPhase] ?? 'spec',
  );
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(false);

  // Scroll container ref for position preservation across artifact reloads.
  const scrollRef = useRef<HTMLDivElement>(null);
  const savedScrollTop = useRef(0);

  const artifactPath = useCallback(
    (tab: string): string => {
      if (tab === 'constitution') {
        return `${entityRootPath}/.specify/memory/constitution.md`;
      }
      const coreMap: Record<string, string> = {
        spec: 'spec.md',
        plan: 'plan.md',
        tasks: 'tasks.md',
      };
      const filename = coreMap[tab] ?? tab;
      return `${feature.path}/${filename}`;
    },
    [feature.path, entityRootPath],
  );

  const loadTab = useCallback(
    async (tab: string, preserveScroll = false) => {
      // Save scroll position before wiping the view (IMP-SDD-02).
      if (preserveScroll && scrollRef.current) {
        savedScrollTop.current = scrollRef.current.scrollTop;
      } else {
        savedScrollTop.current = 0;
      }
      setLoading(true);
      try {
        const text = await window.api.sdd.readArtifact(artifactPath(tab));
        // Strip HTML comments — they're metadata/sync notes, not user content.
        setContent(text.replace(/<!--[\s\S]*?-->/g, '').trimStart());
      } catch {
        setContent(`_${tab}.md not found._`);
      } finally {
        setLoading(false);
      }
    },
    [artifactPath],
  );

  // Restore scroll position after content is rendered (loading → false).
  useEffect(() => {
    if (!loading && scrollRef.current) {
      scrollRef.current.scrollTop = savedScrollTop.current;
    }
  }, [loading]);

  // Reload when tab changes (fresh start at top) or when the live feature
  // data updates (artifact file was written on disk — preserve scroll).
  // Using granular mtime deps instead of the full feature object prevents
  // infinite re-renders from React's referential equality check.
  const specMtime = feature.artifacts.artifactMtimes?.spec;
  const planMtime = feature.artifacts.artifactMtimes?.plan;
  const tasksMtime = feature.artifacts.artifactMtimes?.tasks;

  // We track the previous tab in a ref so we can distinguish "tab switch"
  // (don't preserve scroll) from "same-tab content update" (preserve scroll).
  const prevTabRef = useRef(activeTab);

  useEffect(() => {
    const isSameTab = activeTab === prevTabRef.current;
    prevTabRef.current = activeTab;
    void loadTab(activeTab, isSameTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, loadTab, specMtime, planMtime, tasksMtime, constitutionMtime]);

  // NOTE: we intentionally do NOT subscribe to onArtifactChanged here.
  // The parent (useSdd hook) already handles the event, updates SddSessionState,
  // and flows fresh feature props down — which changes the mtime deps above
  // and triggers a reload without a second IPC round-trip (WEAK-SDD-05).

  // ── Stale-artifact detection ───────────────────────────────────────────────

  const staleArtifacts = useMemo(() => {
    const stale = new Set<string>();
    const { artifactMtimes } = feature.artifacts;
    if (!artifactMtimes) return stale;
    if (artifactMtimes.spec && artifactMtimes.plan && artifactMtimes.spec > artifactMtimes.plan) {
      stale.add('plan'); // spec was updated after plan was written
    }
    if (artifactMtimes.plan && artifactMtimes.tasks && artifactMtimes.plan > artifactMtimes.tasks) {
      stale.add('tasks'); // plan was updated after tasks were generated
    }
    return stale;
  }, [feature.artifacts]);

  // ── Tab definitions ────────────────────────────────────────────────────────

  const progress = taskProgress(feature.artifacts);

  const coreTabs: { id: string; label: string; available: boolean; isExtra?: boolean }[] = [
    { id: 'spec', label: 'Spec', available: feature.artifacts.hasSpec },
    { id: 'plan', label: 'Plan', available: feature.artifacts.hasPlan },
    { id: 'tasks', label: 'Tasks', available: feature.artifacts.hasTasks },
    { id: 'constitution', label: 'Constitution', available: true },
  ];
  const extraTabs = feature.artifacts.extraArtifacts.map((name) => ({
    id: name,
    label: name.replace(/\.md$/i, '').replace(/-/g, ' '),
    available: true,
    isExtra: true,
  }));
  const tabs = [...coreTabs, ...extraTabs];

  return (
    <div className="flex h-full flex-col">
      {/* Feature title bar */}
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3">
        <span className="text-sm font-semibold text-fg truncate">{feature.slug}</span>
        <span className="text-sm text-fg-subtle shrink-0">#{feature.number}</span>
      </div>

      {/* Tabs — scrollable when many tabs */}
      <div className="flex shrink-0 gap-0.5 overflow-x-auto scroll-thin border-b border-border px-2 pt-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            disabled={!t.available && t.id !== 'constitution'}
            title={
              staleArtifacts.has(t.id)
                ? `${t.label} may be outdated — an earlier artifact was updated after this one was written`
                : t.isExtra
                  ? `Custom artifact: ${t.id}`
                  : undefined
            }
            className={[
              'shrink-0 px-3 py-2 text-sm rounded-t transition-colors whitespace-nowrap',
              activeTab === t.id
                ? 'bg-elevated text-fg border-b-2 border-accent'
                : 'text-fg-muted hover:text-fg',
              !t.available ? 'opacity-40' : '',
              t.isExtra ? 'italic' : '',
            ].join(' ')}
          >
            {/* Stale indicator — ⚠ when a predecessor artifact is newer */}
            {staleArtifacts.has(t.id) && (
              <span className="mr-1 text-amber-400 text-xs" aria-label="may be outdated">⚠</span>
            )}
            {t.label}
            {t.id === 'tasks' && feature.artifacts.hasTasks && progress && (
              <span className="ml-1.5 text-fg-subtle text-xs tabular-nums">
                {progress.checked}/{progress.total}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-hidden scroll-thin px-3 py-3"
      >
        {loading ? (
          <p className="text-sm text-fg-subtle">Loading…</p>
        ) : (
          <div id={viewerIdRef.current} className="sdd-task-list min-w-0">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                // ── Headings ──
                h1: ({ children }) => (
                  <h1 className="text-sm font-bold text-fg mt-5 mb-2.5 pb-1.5 border-b border-border">{children}</h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-[13px] font-bold text-fg uppercase tracking-wider mt-5 mb-2 pb-1 border-b border-border/60">{children}</h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-sm font-semibold text-fg mt-3.5 mb-1.5">{children}</h3>
                ),
                h4: ({ children }) => (
                  <h4 className="text-sm font-medium text-fg-muted mt-2.5 mb-1">{children}</h4>
                ),

                // ── Paragraphs ──
                p: ({ children }) => {
                  // Use recursive text extraction — String(children) produces
                  // "[object Object]" for nodes with inline formatting (MED-SDD-01).
                  const text = extractText(children);
                  // STOP / checkpoint markers — amber warning callout
                  if (/^\*\*STOP[:\s]/i.test(text) || /^STOP[:\s]/i.test(text)) {
                    return (
                      <div className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 my-2">
                        <span className="text-amber-400 text-[10px] font-bold shrink-0 mt-0.5">▶ STOP</span>
                        <p className="text-sm text-fg-muted">{children}</p>
                      </div>
                    );
                  }
                  // Given/When/Then/And acceptance criteria lines
                  const isScenario = /^\*\*(Given|When|Then|And)\*\*/.test(text);
                  return (
                    <p className={isScenario
                      ? 'text-sm text-fg-muted pl-2 border-l border-accent/40 my-1'
                      : 'text-sm text-fg-muted my-2 leading-relaxed'
                    }>{children}</p>
                  );
                },

                // ── Lists ──
                ul: ({ children }) => <ul className="my-2 ml-4 space-y-1 list-disc list-outside">{children}</ul>,
                ol: ({ children }) => <ol className="my-2 ml-4 space-y-1 list-decimal list-outside">{children}</ol>,
                li: ({ children }) => <li className="text-sm text-fg-muted pl-1 leading-relaxed">{children}</li>,

                // ── Inline ──
                strong: ({ children }) => <strong className="font-semibold text-fg">{children}</strong>,
                em: ({ children }) => <em className="italic text-fg-muted">{children}</em>,
                a: ({ href, children }) => (
                  <a href={href} className="text-accent hover:underline" target="_blank" rel="noreferrer">{children}</a>
                ),
                hr: () => <hr className="border-border my-4" />,

                // ── Code ──
                code: ({ children, className }) => {
                  const isBlock = className?.startsWith('language-');
                  if (isBlock) return <code className={className}>{children}</code>;
                  return (
                    <code className="text-accent bg-elevated rounded px-1 py-0.5 text-sm font-mono before:content-none after:content-none">{children}</code>
                  );
                },
                pre: ({ children }) => (
                  <pre className="bg-elevated border border-border rounded-md px-3 py-2.5 my-2.5 text-sm font-mono overflow-x-auto text-fg-muted leading-relaxed">{children}</pre>
                ),

                // ── Blockquote ──
                blockquote: ({ children }) => (
                  <blockquote className="border-l-2 border-accent bg-accent/5 px-3 py-2 my-2.5 rounded-r text-sm text-fg-muted">{children}</blockquote>
                ),

                // ── Tables ──
                table: ({ children }) => (
                  <div className="overflow-x-auto my-3">
                    <table className="w-full text-sm border-collapse">{children}</table>
                  </div>
                ),
                thead: ({ children }) => <thead className="border-b border-border">{children}</thead>,
                tbody: ({ children }) => <tbody className="divide-y divide-border/60">{children}</tbody>,
                th: ({ children }) => <th className="px-2.5 py-2 text-left text-xs font-semibold text-fg uppercase tracking-wide">{children}</th>,
                td: ({ children }) => <td className="px-2.5 py-2 text-sm text-fg-muted">{children}</td>,
                tr: ({ children }) => <tr className="hover:bg-elevated/30 transition-colors">{children}</tr>,

                // ── Interactive checkboxes (tasks.md) ──
                input: ({ type, checked, ...props }) => {
                  if (type !== 'checkbox') return <input type={type} {...props} />;
                  return (
                    <input
                      type="checkbox"
                      defaultChecked={checked}
                      onChange={async (e) => {
                        const el = e.currentTarget;
                        // Scope query to this viewer's container to avoid
                        // index mis-counts if another viewer is mounted.
                        const container = document.getElementById(viewerIdRef.current);
                        const allInputs = container
                          ? Array.from(container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))
                          : [];
                        const idx = allInputs.indexOf(el);
                        if (idx === -1) return;
                        await window.api.sdd.toggleTaskCheckbox(artifactPath('tasks'), idx);
                        // Reload immediately; the FS watcher will also fire and
                        // update the parent feature state with new mtimes.
                        void loadTab('tasks', true);
                      }}
                      className="mr-1.5 cursor-pointer accent-accent"
                      {...props}
                    />
                  );
                },
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
