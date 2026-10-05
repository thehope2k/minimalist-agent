import { ShieldAlert } from 'lucide-react';
import type { LoadedExtension, SetupField } from '@/lib/electron';
import type { SeedSubmit } from '@/App';
import { ConnectionCheck } from './ConnectionCheck';
import { ConsentBanner } from './ConsentBanner';
import { SetupFieldRow } from './SetupFieldRow';
import { useSetupStatus } from './useSetupStatus';
import { buildVerifyExtensionSubmit } from '../verifyExtension';

export function SetupSection({
  extension,
  onStartChatWithSubmission,
}: {
  extension: LoadedExtension;
  onStartChatWithSubmission?: (submit: SeedSubmit) => void;
}) {
  const { slug } = extension;
  const spawnsServer = !!extension.config.mcp;
  const { snapshot, apply } = useSetupStatus(slug);

  if (!snapshot) return null;

  const { fields, unresolvedLiterals, orphanSecrets } = snapshot;
  const hasContent =
    spawnsServer || fields.length > 0 || unresolvedLiterals.length > 0 || orphanSecrets.length > 0;
  if (!hasContent) return null;

  const stepsLeft =
    fields.filter((f) => !f.isSet).length +
    unresolvedLiterals.length +
    (spawnsServer && !snapshot.hasConsent ? 1 : 0);

  const saveField = (field: SetupField, value: string) =>
    apply(() =>
      field.secret
        ? window.api.extensions.setSecret(slug, field.key, value)
        : window.api.extensions.setInput(slug, field.key, value),
    );

  const clearField = (field: SetupField) => {
    if (!window.confirm(`Clear "${field.label}" for ${slug}?`)) return;
    void apply(() =>
      field.secret
        ? window.api.extensions.deleteSecret(slug, field.key)
        : window.api.extensions.deleteInput(slug, field.key),
    );
  };

  return (
    <section className="border-b border-border/60 px-4 py-4">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="flex-1 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">
          Setup
        </h2>
        <span className="text-xs text-fg-subtle">
          {stepsLeft === 0 ? 'All set' : `${stepsLeft} step${stepsLeft === 1 ? '' : 's'} left`}
        </span>
      </div>

      <div className="space-y-4">
        {!snapshot.encryptionAvailable && fields.some((f) => f.secret) && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-200">
            OS keychain encryption unavailable on this machine — secrets are stored as plaintext on
            disk. Use sandboxed credentials only.
          </div>
        )}

        {unresolvedLiterals.length > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-200">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
            <span>
              extension.json still has placeholder values for{' '}
              <code>{unresolvedLiterals.join(', ')}</code>. Ask the agent to turn them into setup
              fields.
            </span>
          </div>
        )}

        {fields.map((field) => (
          <SetupFieldRow
            key={field.key}
            field={field}
            onSave={(value) => void saveField(field, value)}
            onClear={() => clearField(field)}
          />
        ))}

        {spawnsServer && (
          <ConsentBanner
            granted={snapshot.hasConsent}
            slug={slug}
            onGrant={() => void apply(() => window.api.extensions.grantConsent(slug))}
            onRevoke={() => void apply(() => window.api.extensions.revokeConsent(slug))}
          />
        )}

        {orphanSecrets.map((key) => (
          <div key={key} className="flex items-center gap-2 text-xs text-fg-subtle">
            <code className="flex-1 truncate">{key}</code>
            <span>stored, but no longer used</span>
            <button
              type="button"
              className="text-fg-muted hover:text-fg"
              onClick={() => void apply(() => window.api.extensions.deleteSecret(slug, key))}
            >
              Delete
            </button>
          </div>
        ))}

        {stepsLeft === 0 && (
          <ConnectionCheck
            slug={slug}
            testable={spawnsServer}
            onStartChat={
              onStartChatWithSubmission &&
              (() => onStartChatWithSubmission(buildVerifyExtensionSubmit(extension)))
            }
          />
        )}
      </div>
    </section>
  );
}
