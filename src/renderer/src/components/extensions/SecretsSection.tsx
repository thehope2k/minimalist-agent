import { useEffect, useState } from 'react';
import { Eye, EyeOff, Key, ShieldAlert, ShieldCheck, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { reload as reloadExtensions } from '@/lib/extensions';
import type { LoadedExtension } from '@/lib/electron';

type Status = {
  declared: string[];
  set: string[];
  encryptionAvailable: boolean;
  hasConsent: boolean;
};

const EMPTY: Status = {
  declared: [],
  set: [],
  encryptionAvailable: false,
  hasConsent: true,
};

export function SecretsSection({ extension }: { extension: LoadedExtension }) {
  const slug = extension.slug;
  const isMcp = !!extension.config.mcp;
  const [status, setStatus] = useState<Status>(EMPTY);
  const [pending, setPending] = useState<Record<string, string>>({});
  const [reveal, setReveal] = useState<Record<string, boolean>>({});

  const refresh = async () => {
    const [declared, set, encryptionAvailable, hasConsent] = await Promise.all([
      window.api.extensions.declaredSecrets(slug),
      window.api.extensions.listSecretKeys(slug),
      window.api.extensions.secretsEncryptionAvailable(),
      isMcp
        ? window.api.extensions.hasConsent(slug)
        : Promise.resolve(true),
    ]);
    setStatus({ declared, set, encryptionAvailable, hasConsent });
  };

  useEffect(() => {
    void refresh();
    setPending({});
    setReveal({});
  }, [slug]);

  // Union of declared + currently-set keys.
  const allKeys = Array.from(new Set([...status.declared, ...status.set])).sort();

  const handleSave = async (keyName: string) => {
    const value = pending[keyName];
    if (!value) return;
    await window.api.extensions.setSecret(slug, keyName, value);
    setPending((p) => {
      const { [keyName]: _, ...rest } = p;
      return rest;
    });
    await refresh();
    await reloadExtensions();
  };

  const handleDelete = async (keyName: string) => {
    if (!window.confirm(`Delete secret "${keyName}" for ${slug}?`)) return;
    await window.api.extensions.deleteSecret(slug, keyName);
    await refresh();
    await reloadExtensions();
  };

  const handleConsent = async () => {
    if (
      !window.confirm(
        `This will allow the agent to spawn the MCP server declared in ` +
          `extension.json the next time you chat. Spawning runs code from ` +
          `whatever package the extension points at — only grant consent ` +
          `for extensions you trust.\n\nGrant consent for "${slug}"?`,
      )
    ) {
      return;
    }
    await window.api.extensions.grantConsent(slug);
    await refresh();
    await reloadExtensions();
  };

  const handleRevoke = async () => {
    await window.api.extensions.revokeConsent(slug);
    await refresh();
    await reloadExtensions();
  };

  if (allKeys.length === 0 && !isMcp) return null;

  return (
    <section className="border-b border-border/60 px-4 py-4">
      <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">
        Secrets &amp; consent
      </h2>

      {!status.encryptionAvailable && allKeys.length > 0 && (
        <div className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-200">
          OS keychain encryption unavailable on this machine — secrets are
          stored as plaintext on disk. Use sandboxed credentials only.
        </div>
      )}

      {isMcp && (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-border/60 bg-elevated/40 p-2 text-xs">
          {status.hasConsent ? (
            <>
              <ShieldCheck className="h-4 w-4 text-green-400" strokeWidth={1.75} />
              <span className="flex-1 text-fg-muted">
                MCP consent granted. The configured server may be spawned.
              </span>
              <button
                type="button"
                onClick={handleRevoke}
                className="rounded-md px-2 py-0.5 text-fg-subtle hover:bg-elevated hover:text-fg"
              >
                Revoke
              </button>
            </>
          ) : (
            <>
              <ShieldAlert className="h-4 w-4 text-amber-400" strokeWidth={1.75} />
              <span className="flex-1 text-fg-muted">
                MCP server has not been approved. Spawn is blocked until you
                grant consent.
              </span>
              <button
                type="button"
                onClick={handleConsent}
                className="rounded-md bg-accent px-2 py-0.5 text-accent-fg hover:bg-accent-hover"
              >
                Grant
              </button>
            </>
          )}
        </div>
      )}

      {allKeys.length > 0 && (
        <div className="space-y-2">
          {allKeys.map((keyName) => {
            const isSet = status.set.includes(keyName);
            const isDeclared = status.declared.includes(keyName);
            const showText = !!reveal[keyName];
            const draft = pending[keyName] ?? '';
            return (
              <div
                key={keyName}
                className="rounded-md border border-border bg-elevated/40 p-2"
              >
                <div className="flex items-center gap-2">
                  <Key className="h-3.5 w-3.5 text-fg-subtle" strokeWidth={1.75} />
                  <code className="flex-1 truncate font-mono text-xs text-fg">
                    {keyName}
                  </code>
                  <span
                    className={cn(
                      'rounded px-1.5 py-px text-[10px] uppercase tracking-wide',
                      isSet
                        ? 'bg-green-500/15 text-green-300'
                        : 'bg-amber-500/15 text-amber-300',
                    )}
                  >
                    {isSet ? 'set' : isDeclared ? 'missing' : 'orphan'}
                  </span>
                  {isSet && (
                    <button
                      type="button"
                      onClick={() => handleDelete(keyName)}
                      className="rounded-md p-1 text-fg-subtle hover:bg-elevated hover:text-fg"
                      title="Delete secret"
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </button>
                  )}
                </div>
                <div className="mt-1.5 flex gap-2">
                  <input
                    type={showText ? 'text' : 'password'}
                    value={draft}
                    onChange={(e) =>
                      setPending((p) => ({ ...p, [keyName]: e.target.value }))
                    }
                    placeholder={isSet ? 'Replace secret…' : 'Enter secret…'}
                    spellCheck={false}
                    autoComplete="off"
                    className="flex-1 rounded-md border border-border bg-app/60 px-2 py-1 font-mono text-xs text-fg outline-none focus:border-accent/60"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setReveal((r) => ({ ...r, [keyName]: !showText }))
                    }
                    className="rounded-md p-1 text-fg-subtle hover:bg-elevated hover:text-fg"
                    title={showText ? 'Hide' : 'Show'}
                  >
                    {showText ? (
                      <EyeOff className="h-3.5 w-3.5" strokeWidth={1.75} />
                    ) : (
                      <Eye className="h-3.5 w-3.5" strokeWidth={1.75} />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSave(keyName)}
                    disabled={!draft}
                    className={cn(
                      'rounded-md px-2 text-xs',
                      draft
                        ? 'bg-accent text-accent-fg hover:bg-accent-hover'
                        : 'bg-elevated text-fg-subtle',
                    )}
                  >
                    Save
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
