import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SddFeature, SddPhase } from '@/lib/sdd';
import { taskProgress } from '@/lib/sdd';
import { SddMarkdownContent } from './SddMarkdown';

interface Props {
  feature: SddFeature;
  entityRootPath: string;
  onClose: () => void;
}

/**
 * For each phase, open the tab the user actually wants to READ at that point:
 * - constitution / specify → spec (constitution is now at entity level)
 * - plan → spec (review spec before planning)
 * - tasks → plan (review plan before generating tasks)
 * - implement / complete → tasks (work through / review task checklist)
 */
const PHASE_DEFAULT_TAB: Record<SddPhase, string> = {
  constitution: 'spec',
  specify:      'spec',
  plan:         'spec',
  tasks:        'plan',
  implement:    'tasks',
  complete:     'tasks',
};

/**
 * Recursively extract plain text from a React node tree.
 * Kept here only for the STOP/scenario paragraph detection — the shared
 * SddMarkdown module owns the canonical copy used for rendering.
 */

export function SddArtifactViewer({ feature, entityRootPath, onClose }: Props) {
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
  }, [activeTab, loadTab, specMtime, planMtime, tasksMtime]);

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
          <SddMarkdownContent
            id={viewerIdRef.current}
            content={content}
            extraComponents={{
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
          />
        )}
      </div>
    </div>
  );
}
