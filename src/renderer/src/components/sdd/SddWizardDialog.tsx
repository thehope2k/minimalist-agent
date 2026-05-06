import { useEffect, useRef, useState } from 'react';
import { FolderOpen } from 'lucide-react';
import { Button, IconButton } from '@/components/ui';
import { createSession } from '@/lib/sessions';

interface Props {
  onClose: () => void;
  onSuccess: (sessionId: string) => void;
}

const TITLE_ID = 'sdd-wizard-dialog-title';

export function SddWizardDialog({ onClose, onSuccess }: Props) {
  const [targetDir, setTargetDir] = useState<string>('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [installCmd, setInstallCmd] = useState<string | null>(null);
  const firstFocusRef = useRef<HTMLButtonElement>(null);

  // Close on Escape unless init is in progress.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !running) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, running]);

  // Move focus into the dialog on mount so keyboard users land here.
  useEffect(() => {
    firstFocusRef.current?.focus();
  }, []);

  const handlePickDir = async () => {
    const dir = await window.api.fs.pickDirectory();
    if (dir) setTargetDir(dir);
  };

  const handleInit = async () => {
    if (!targetDir) return;
    setRunning(true);
    setError(null);
    setInstallCmd(null);
    try {
      const result = await window.api.sdd.runInit(targetDir);
      if (result.success) {
        const meta = await createSession({ workingDirectory: targetDir });
        onSuccess(meta.id);
        onClose();
      } else {
        setError(result.error ?? 'Unknown error');
        if (result.installCmd) setInstallCmd(result.installCmd);
      }
    } finally {
      setRunning(false);
    }
  };

  return (
    // Backdrop — click outside to dismiss (unless running)
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget && !running) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        className="w-full max-w-md rounded-lg border border-border bg-panel p-5 shadow-xl"
      >
        <h2 id={TITLE_ID} className="mb-4 text-base font-semibold text-fg">
          New SDD Project
        </h2>

        <label className="mb-1 block text-xs text-fg-muted">Project directory</label>
        <div className="flex items-center gap-2 mb-4">
          <input
            readOnly
            value={targetDir}
            placeholder="Pick a directory…"
            className="flex-1 rounded border border-border bg-elevated px-2 py-1.5 text-xs text-fg placeholder:text-fg-subtle"
          />
          <IconButton
            ref={firstFocusRef}
            icon={FolderOpen}
            onClick={handlePickDir}
            title="Pick directory"
          />
        </div>

        {error && (
          <div className="mb-3 rounded border border-border bg-elevated px-3 py-2">
            <p className="text-xs text-fg-muted">{error}</p>
            {installCmd && (
              <pre className="mt-1 overflow-x-auto text-xs text-fg-subtle">{installCmd}</pre>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={running}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleInit}
            disabled={!targetDir || running}
          >
            {running ? 'Initializing…' : 'Initialize SDD'}
          </Button>
        </div>
      </div>
    </div>
  );
}
