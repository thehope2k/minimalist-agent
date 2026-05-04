import { useEffect, useState } from 'react';
import type { UpdateInfo } from '../lib/electron';

export function UpdateBanner() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);

  useEffect(() => {
    void window.api.update.getInfo().then(setInfo);
    return window.api.update.onInfo(setInfo);
  }, []);

  if (!info) return null;
  if (info.state === 'idle' || info.state === 'checking') return null;
  if (info.state === 'available' && dismissed === info.latestVersion) return null;
  if (info.state === 'error' && dismissed === 'error') return null;

  return (
    <div className="flex items-center justify-between gap-3 border-b border-border-strong bg-elevated-2 px-4 py-2 text-sm text-fg">
      <div className="min-w-0 flex-1 truncate">
        {info.state === 'available' && (
          <span>
            Update available — <strong>v{info.latestVersion}</strong>{' '}
            <span className="text-fg-muted">(current v{info.currentVersion})</span>
          </span>
        )}
        {info.state === 'error' && (
          <span className="text-amber-300">
            Update check failed —{' '}
            <a
              href="https://github.com/thehope2k/minimalist-agent/releases/latest"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:opacity-80"
            >
              download latest from GitHub
            </a>
            {info.error && (
              <span className="ml-2 font-mono text-xs opacity-60">({info.error})</span>
            )}
          </span>
        )}
        {info.state === 'downloading' && (
          <span>
            Downloading v{info.latestVersion}… {info.progress}%
          </span>
        )}
        {info.state === 'ready' && (
          <span>
            Update ready — <strong>v{info.latestVersion}</strong>. Restart to install.
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {info.state === 'available' && (
          <>
            <button
              onClick={() => void window.api.update.download()}
              className="rounded bg-fg px-3 py-1 text-xs font-medium text-app hover:opacity-90"
            >
              Download
            </button>
            <button
              onClick={() => setDismissed(info.latestVersion)}
              className="rounded px-2 py-1 text-xs text-fg-muted hover:bg-elevated"
            >
              Later
            </button>
          </>
        )}
        {info.state === 'error' && (
          <button
            onClick={() => setDismissed('error')}
            className="rounded px-2 py-1 text-xs text-fg-muted hover:bg-elevated"
          >
            Dismiss
          </button>
        )}
        {info.state === 'downloading' && (
          <div className="h-1.5 w-32 overflow-hidden rounded bg-elevated">
            <div
              className="h-full bg-fg transition-all"
              style={{ width: `${info.progress}%` }}
            />
          </div>
        )}
        {info.state === 'ready' && (
          <>
            <button
              onClick={() => void window.api.update.install()}
              className="rounded bg-fg px-3 py-1 text-xs font-medium text-app hover:opacity-90"
            >
              Restart now
            </button>
            <button
              onClick={() => setDismissed(info.latestVersion)}
              className="rounded px-2 py-1 text-xs text-fg-muted hover:bg-elevated"
            >
              Later
            </button>
          </>
        )}
      </div>
    </div>
  );
}
