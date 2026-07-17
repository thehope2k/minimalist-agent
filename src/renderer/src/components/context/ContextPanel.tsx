import { Layers, Plus, RefreshCw, X } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useContextPanel } from '@/hooks/useContextPanel';
import { getProjectSkillsDir } from '@/lib/skills';
import { getProjectExtensionsDir } from '@/lib/extensions';
import { PinnedSection, AvailableSection, ExtensionsSection } from './ContextPanelSections';
import { AddSkillDialog } from '@/components/skills/AddSkillDialog';
import { AddExtensionDialog } from '@/components/extensions/AddExtensionDialog';
import type { SeedSubmit } from '@/App';

function basename(p: string): string {
  return p.replace(/\/+$/, '').split('/').pop() ?? p;
}

interface ContextPanelProps {
  sessionId: string | null;
  cwd?: string;
  pinnedAssets?: string[];
  /** Called after pin/unpin so the parent can reload session meta */
  onPinnedChange?: () => void;
  onStartChatWithSubmission?: (submit: SeedSubmit) => void;
  onClose?: () => void;
}

export function ContextPanel({
  sessionId,
  cwd,
  pinnedAssets,
  onPinnedChange,
  onStartChatWithSubmission,
  onClose,
}: ContextPanelProps) {
  const [newDialog, setNewDialog] = useState<'skill' | 'extension' | null>(null);
  const [projectSkillsDir, setProjectSkillsDir] = useState<string | undefined>();
  const [projectExtDir, setProjectExtDir] = useState<string | undefined>();

  const openNewDialog = async (type: 'skill' | 'extension') => {
    if (!cwd) return;
    if (type === 'skill' && !projectSkillsDir) {
      setProjectSkillsDir(await getProjectSkillsDir(cwd));
    } else if (type === 'extension' && !projectExtDir) {
      setProjectExtDir(await getProjectExtensionsDir(cwd));
    }
    setNewDialog(type);
  };

  const {
    loading,
    projectSkills,
    userSkills,
    pinnedSkills,
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
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="ml-1 rounded p-0.5 text-fg-subtle hover:bg-elevated hover:text-fg"
            aria-label="Close context panel"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </header>

      {/* Body */}
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {/* Pinned / Active */}
        <PinnedSection
          pinnedSkills={pinnedSkills}
          tokenEstimate={tokenEstimate}
          tokenWarning={tokenWarning}
          onUnpin={handleUnpin}
        />

        {/* Available — project tier */}
        {cwd && (
          <AvailableSection
            title={basename(cwd)}
            skills={projectSkills}
            isPinned={isPinned}
            onPin={handlePin}
            onUnpin={handleUnpin}
            cwd={cwd}
            onNew={onStartChatWithSubmission ? openNewDialog : undefined}
          />
        )}

        {/* Available — user tier */}
        <AvailableSection
          title="Global"
          skills={userSkills}
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
          userSkills.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
              <Layers className="h-5 w-5 text-fg-subtle" strokeWidth={1.5} />
              <p className="text-sm text-fg-muted">No skills yet</p>
              <p className="max-w-60 text-xs text-fg-subtle">
                Add skills to{' '}
                <code className="font-mono">~/.minimalist-agent/skills/</code>.
              </p>
            </div>
          )}
      </div>

      {/* Project-scoped creation dialogs */}
      {onStartChatWithSubmission && (
        <>
          <AddSkillDialog
            open={newDialog === 'skill'}
            onClose={() => setNewDialog(null)}
            onSubmit={(s) => { onStartChatWithSubmission({ ...s, workingDirectory: cwd }); setNewDialog(null); }}
            projectDir={projectSkillsDir}
          />
          <AddExtensionDialog
            open={newDialog === 'extension'}
            onClose={() => setNewDialog(null)}
            onSubmit={(s) => { onStartChatWithSubmission({ ...s, workingDirectory: cwd }); setNewDialog(null); }}
            projectDir={projectExtDir}
          />
        </>
      )}
    </div>
  );
}
