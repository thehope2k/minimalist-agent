import { useState } from 'react';
import { ANTHROPIC_MODELS } from '@/lib/models';
import { generateSlug, saveConnection } from '@/lib/connections';
import type { ConnectionMeta, Credential } from '@/lib/electron';
import { Button, Field, Input, Select } from '@/components/ui';
import { Actions, ErrorBox, FormShell } from './shared';
import type { FlowProps } from './types';

export function ApiKeyForm({ onBack, onClose, onSaved, editingMeta }: FlowProps) {
  const editing = !!editingMeta;
  const [name, setName] = useState(editingMeta?.name ?? 'Anthropic API');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(editingMeta?.defaultModel ?? ANTHROPIC_MODELS[0].id);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setError(null);
    if (!name.trim()) return setError('Name is required.');
    if (!apiKey.trim().startsWith('sk-ant-'))
      return setError('Anthropic keys start with "sk-ant-".');

    setSaving(true);
    try {
      const meta: ConnectionMeta = editing
        ? {
            ...editingMeta!,
            name: name.trim(),
            defaultModel: model,
          }
        : {
            slug: generateSlug(name),
            name: name.trim(),
            providerType: 'anthropic',
            authType: 'api_key',
            defaultModel: model,
            models: ANTHROPIC_MODELS,
            createdAt: Date.now(),
          };
      const credential: Credential = { type: 'api_key', apiKey: apiKey.trim() };
      await saveConnection(meta, credential);
      onSaved(meta);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save connection.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormShell title={editing ? 'Update API key' : 'Anthropic API key'} onBack={onBack}>
      <Field label="Name">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Anthropic – Personal"
        />
      </Field>

      <Field
        label="API key"
        hint="Get one at console.anthropic.com. Stored encrypted via the OS keychain."
      >
        <Input
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          type="password"
          autoComplete="off"
          mono
          placeholder="sk-ant-…"
        />
      </Field>

      <Field label="Default model">
        <Select
          value={model}
          onChange={setModel}
          options={ANTHROPIC_MODELS.map((m) => ({
            value: m.id,
            label: `${m.name} — ${m.description}`,
          }))}
        />
      </Field>

      {error && <ErrorBox>{error}</ErrorBox>}

      <Actions>
        <Button variant="ghost" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button variant="primary" onClick={submit} loading={saving}>
          {editing ? 'Update key' : 'Save connection'}
        </Button>
      </Actions>
    </FormShell>
  );
}
