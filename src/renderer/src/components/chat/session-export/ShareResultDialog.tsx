import { useState } from 'react';
import { Check, Copy, ExternalLink, Loader2, Trash2 } from 'lucide-react';
import { ExpandModal, Button } from '../../ui';
import { revokeSessionExport } from '@/lib/sessions';
import { forgetSharedLink, type SharedLinkRecord } from '@/lib/shared-links';
import { MODE_LABELS } from '@/lib/session-export';

/** Result surface after a successful share: the link + copy / open / revoke. */
export function ShareResultDialog({
  record,
  onClose,
}: {
  record: SharedLinkRecord;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [revoked, setRevoked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copy() {
    await navigator.clipboard.writeText(record.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function revoke() {
    setRevoking(true);
    setError(null);
    try {
      await revokeSessionExport(record.namespace, record.id, record.ownerToken);
      forgetSharedLink(record.id);
      setRevoked(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRevoking(false);
    }
  }

  const expiry = record.expiresAt
    ? new Date(record.expiresAt).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : null;

  return (
    <ExpandModal
      title={revoked ? 'Link revoked' : 'Share link created'}
      onClose={onClose}
      className="!w-[min(92vw,520px)]"
    >
      <div className="flex flex-col gap-3 p-4">
        {revoked ? (
          <p className="text-sm text-fg-muted">
            The link has been taken down. It will no longer load for anyone.
          </p>
        ) : (
          <>
            <div className="flex items-center gap-2 rounded-md border border-border bg-elevated/50 px-3 py-2">
              <input
                readOnly
                value={record.url}
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 bg-transparent font-mono text-xs text-fg outline-none"
              />
              <button
                type="button"
                onClick={() => void copy()}
                aria-label="Copy link"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-fg-muted hover:bg-elevated hover:text-fg"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-emerald-400" strokeWidth={2} />
                ) : (
                  <Copy className="h-4 w-4" strokeWidth={1.75} />
                )}
              </button>
            </div>

            <p className="text-[11px] leading-snug text-fg-subtle">
              Anyone with this link can view the <b>{MODE_LABELS[record.mode]}</b> export.
              Paths &amp; common secrets were stripped before upload. Hosted on{' '}
              <button
                type="button"
                onClick={() => void window.api.app.openExternal('https://brewpage.app')}
                className="underline hover:text-fg"
              >
                brewpage.app
              </button>
              {expiry && <> · auto-deletes <b>{expiry}</b>.</>}
            </p>

            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                icon={ExternalLink}
                onClick={() => void window.api.app.openExternal(record.url)}
              >
                Open
              </Button>
              <Button
                variant="outline"
                size="sm"
                icon={revoking ? Loader2 : Trash2}
                disabled={revoking}
                onClick={() => void revoke()}
                className={revoking ? '[&_svg]:animate-spin' : undefined}
              >
                {revoking ? 'Revoking…' : 'Revoke'}
              </Button>
            </div>

            {error && <p className="text-[11px] text-red-400">{error}</p>}
          </>
        )}
      </div>
    </ExpandModal>
  );
}
