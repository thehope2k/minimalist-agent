// Single source of truth for "what must the user still do before this
// extension works" — drives the Setup form, the status badge, and the MCP
// spawn gate, so they can never disagree.

import { getSecret, listSecretKeys } from './secrets';
import { getInput } from './inputs';
import type { ExtensionSetupStatus, SetupField } from '../../shared/electron-api';
import type { EnvLookup, EnvValue, LoadedExtension } from './types';
import { isInputRef, isPlaceholderValue, isSecretRef } from './types';

export function envLookupFor(slug: string): EnvLookup {
  return {
    secret: (key) => getSecret(slug, key),
    input: (key) => getInput(slug, key),
  };
}

function refKey(value: EnvValue): string | null {
  if (isSecretRef(value)) return value.secret;
  if (isInputRef(value)) return value.input;
  return null;
}

export function getSetupStatus(ext: LoadedExtension): ExtensionSetupStatus {
  const env = ext.config.env ?? {};
  const meta = ext.config.setup?.fields ?? {};
  const fields = new Map<string, SetupField>();
  const unresolvedLiterals: string[] = [];

  for (const [envName, value] of Object.entries(env)) {
    const key = refKey(value);
    if (key === null) {
      if (typeof value === 'string' && isPlaceholderValue(value)) unresolvedLiterals.push(envName);
      continue;
    }
    if (fields.has(key)) continue;
    const secret = isSecretRef(value);
    const stored = secret ? getSecret(ext.slug, key) : getInput(ext.slug, key);
    fields.set(key, {
      key,
      label: meta[key]?.label ?? key,
      hint: meta[key]?.hint,
      placeholder: meta[key]?.placeholder,
      secret,
      isSet: !!stored,
      ...(secret ? {} : { value: stored ?? '' }),
    });
  }

  const declared = new Set(fields.keys());
  const orphanSecrets = listSecretKeys(ext.slug).filter((k) => !declared.has(k));

  return { fields: Array.from(fields.values()), unresolvedLiterals, orphanSecrets };
}

/** Human-readable blockers; empty means the extension's own configuration is complete. */
export function listMissingSetup(ext: LoadedExtension): string[] {
  const status = getSetupStatus(ext);
  return [
    ...status.fields.filter((f) => !f.isSet).map((f) => f.label),
    ...status.unresolvedLiterals.map((name) => `${name} (placeholder in extension.json)`),
  ];
}
