import { Layers, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useContextPanel } from '@/hooks/useContextPanel';
import { PinnedSection, AvailableSection, ExtensionsSection } from './ContextPanelSections';

function basename(p: string): string {
  return p.replace(/\/+$/, '').split('/').pop() ?? p;
}

interface ContextPanelProps {
  sessionId: string | null;
  cwd?: string;
  pinnedAssets?: string[];
  /** Called after pin/unpin so the parent can reload session meta */
  onPinnedChange?: () => void;
}

export function ContextPanel({
  sessionId,
  cwd,
  pinnedAssets,
  onPinnedChange,
}: ContextPanelProps) {
  const {
    loading,
    projectSkills,
    userSkills,
    projectAgents,
    userAgents,
    pinnedSkills,
    pinnedAgents,
    projectExtensions,
    userExtensions,
    tokenEstimate,
    tokenWarning,
    pin,
    unpin,
    isPinned,
    refresh,
  } = useContextPanel({ sessionId, cwd, pinnedAssets });

  const handlePin = async (scopedSlug: string) => {
    try { await pin(scopedSlug); }
    finally { onPinnedChange?.(); }
  };

  const handleUnpin = async (scopedSlug: string) => {
    try { await unpin(scopedSlug); }
    finally { onPinnedChange?.(); }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3 text-[15px] font-semibold text-fg">
        <Layers className="h-4 w-4 text-fg-muted" strokeWidth={1.75} />
        <span>Context</span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => refresh(true)}
          disabled={loading}
          className="inline-flex items-center rounded-md p-1 text-fg-subtle hover:bg-elevated hover:text-fg disabled:opacity-50"
          title="Refresh"
          aria-label="Refresh context panel"
        >
          <RefreshCw
            className={cn('h-3.5 w-3.5', loading && 'animate-spin')}
            strokeWidth={1.75}
          />
        </button>
      </header>

      {/* Body */}
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {/* Pinned / Active */}
        <PinnedSection
          pinnedSkills={pinnedSkills}
          pinnedAgents={pinnedAgents}
          tokenEstimate={tokenEstimate}
          tokenWarning={tokenWarning}
          onUnpin={handleUnpin}
        />

        {/* Available — project tier */}
        {(projectSkills.length > 0 || projectAgents.length > 0) && (
          <AvailableSection
            title={cwd ? basename(cwd) : 'Project'}
            skills={projectSkills}
            agents={projectAgents}
            isPinned={isPinned}
            onPin={handlePin}
            onUnpin={handleUnpin}
            cwd={cwd}
          />
        )}

        {/* Available — user tier */}
        <AvailableSection
          title="Global"
          skills={userSkills}
          agents={userAgents}
          isPinned={isPinned}
          onPin={handlePin}
          onUnpin={handleUnpin}
          cwd={cwd}
        />

        {/* Extensions — project then user, read-only */}
        {projectExtensions.length > 0 && (
          <ExtensionsSection title={cwd ? basename(cwd) : 'Project'} extensions={projectExtensions} />
        )}
        <ExtensionsSection title="Global" extensions={userExtensions} />

        {/* Empty state */}
        {!loading &&
          projectSkills.length === 0 &&
          projectAgents.length === 0 &&
          userSkills.length === 0 &&
          userAgents.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
              <Layers className="h-5 w-5 text-fg-subtle" strokeWidth={1.5} />
              <p className="text-sm text-fg-muted">No skills or agents yet</p>
              <p className="max-w-60 text-xs text-fg-subtle">
                Add skills to{' '}
                <code className="font-mono">~/.minimalist-agent/skills/</code> or drop an{' '}
                <code className="font-mono">agents/</code> folder in{' '}
                <code className="font-mono">.minimalist-agent/</code> in your project.
              </p>
            </div>
          )}
      </div>
    </div>
  );
}
