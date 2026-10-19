import { useEffect, useState } from 'react';
import { FolderSearch, X } from 'lucide-react';
import { Button, IconButton, Toggle } from '@/components/ui';
import type { ClaudeSyncPlan, ClaudeSyncResult } from '@/lib/electron';
import { SyncGroup } from './SyncGroup';

type Props = { onClose: () => void };

type Excluded = Record<string, string[]>;

// Each checkbox change re-runs the preview in main, so the list always shows
// exactly what Sync will do.
export function SyncToClaudeDialog({ onClose }: Props) {
  const [includeSecrets, setIncludeSecrets] = useState(false);
  // null until the first preview returns the remembered exclusions.
  const [excluded, setExcluded] = useState<Excluded | null>(null);
  const [plan, setPlan] = useState<ClaudeSyncPlan | null>(null);
  const [result, setResult] = useState<ClaudeSyncResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let alive = true;
    window.api.claudeSync
      .preview(includeSecrets, excluded ?? undefined)
      .then((p) => {
        if (!alive) return;
        setPlan(p);
        // Adopt remembered exclusions only for groups not seen yet; returning
        // `prev` unchanged keeps this effect from re-running forever.
        setExcluded((prev) => {
          const unseen = p.groups.filter((g) => !prev || !(g.id in prev));
          if (unseen.length === 0) return prev;
          return { ...prev, ...Object.fromEntries(unseen.map((g) => [g.id, g.excluded])) };
        });
      })
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [includeSecrets, excluded, refreshKey]);

  const toggle = (groupId: string, keys: string[], include: boolean) => {
    setResult(null);
    setExcluded((prev) => {
      const next = new Set(prev?.[groupId] ?? []);
      for (const key of keys) {
        if (include) next.delete(key);
        else next.add(key);
      }
      return { ...prev, [groupId]: [...next] };
    });
  };

  const addFolder = async () => {
    const picked = await window.api.claudeSync.addFolder();
    if (!picked) return;
    setNotice(
      picked.added.length > 0
        ? `Found ${picked.added.length} project(s) with MA assets.`
        : 'No projects with MA skills, agents, or extensions were found there.',
    );
    setRefreshKey((k) => k + 1);
  };

  const sync = async () => {
    if (!excluded) return;
    setSyncing(true);
    setError(null);
    try {
      const r = await window.api.claudeSync.run(includeSecrets, excluded);
      setResult(r);
      setPlan(r.plan);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  };

  const changes = (plan?.groups ?? []).flatMap((g) =>
    g.items.filter((i) => i.action === 'add' || i.action === 'update' || i.action === 'remove'),
  ).length;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Sync to Claude Code"
        className="flex max-h-[85vh] w-180 flex-col overflow-hidden rounded-xl border border-border bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-fg">Sync to Claude Code</h2>
            <p className="mt-1 text-xs text-fg-subtle">
              Your own skills, agents, and extensions go to your Claude setup; each project's go to
              that project's <code className="font-mono">.claude/</code>, kept out of git. Untick
              anything you don't want; MA remembers. One way: MA only changes what it created.
            </p>
          </div>
          <IconButton icon={X} label="Close" onClick={onClose} />
        </header>

        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          {error && <p className="px-5 py-2 text-xs text-red-300">{error}</p>}
          {notice && <p className="px-5 py-2 text-xs text-fg-muted">{notice}</p>}
          {!plan && !error && <p className="px-5 py-3 text-sm text-fg-subtle">Checking…</p>}
          {result && (
            <p className="px-5 py-2 text-xs text-fg-muted">
              {result.failed.length === 0
                ? 'Synced. Claude Code picks up skills and agents in new sessions.'
                : `Synced with ${result.failed.length} failure(s):`}
            </p>
          )}
          {result?.failed.map((f) => (
            <p key={`${f.group}:${f.kind}:${f.name}`} className="px-5 text-xs text-red-300">
              {f.kind} {f.name}: {f.error}
            </p>
          ))}
          {plan?.groups.map((group) => (
            <SyncGroup key={group.id} group={group} onToggle={toggle} disabled={syncing} />
          ))}
        </div>

        <footer className="space-y-3 border-t border-border px-5 py-4">
          <div className="flex items-start gap-3 text-xs">
            <Toggle value={includeSecrets} onChange={setIncludeSecrets} label="Include secrets" />
            <span className="text-fg-muted">
              <span className="font-medium text-fg">Include secrets</span>
              {plan &&
                plan.secretGated > 0 &&
                !includeSecrets &&
                ` (${plan.secretGated} item(s) need one)`}
              <br />
              Copies tokens and API keys from MA's keychain into Claude's config files, which store
              them as plain text.
            </span>
          </div>
          {plan && !plan.cliPath && (
            <p className="text-xs text-amber-300">
              Claude Code's CLI (<code>claude</code>) wasn't found, so MCP servers are skipped.
            </p>
          )}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              icon={FolderSearch}
              onClick={() => void addFolder()}
              disabled={syncing}
            >
              Add folder…
            </Button>
            <div className="flex-1" />
            <Button variant="ghost" onClick={onClose}>
              {result ? 'Done' : 'Cancel'}
            </Button>
            <Button
              variant="primary"
              onClick={() => void sync()}
              disabled={!plan || changes === 0 || syncing}
              loading={syncing}
            >
              {changes > 0 ? `Sync ${changes} change(s)` : 'Up to date'}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
