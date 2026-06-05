import { useMemo, useState } from 'react';
import { CheckCircle2, ExternalLink } from 'lucide-react';
import { generateSlug, saveConnection } from '@/lib/connections';
import type { ConnectionMeta, Credential } from '@/lib/electron';
import type { ModelDef } from '@/lib/models';
import {
  CUSTOM_PRESET_ID,
  OPENAI_COMPATIBLE_PRESETS,
  getPreset,
} from '@/lib/openai-compatible-presets';
import { Button, Field, Input, PasswordInput, Select, Textarea } from '@/components/ui';
import { Actions, ErrorBox, FormShell } from './shared';
import type { FlowProps } from './types';

/** Build a ModelDef for an id we have no rich metadata for (custom / discovered). */
function minimalModel(id: string, source = 'Discovered'): ModelDef {
  return {
    id,
    name: id,
    shortName: id.split('/').pop() ?? id,
    description: `${source} · OpenAI-compatible`,
    contextWindow: 128_000,
    supportsToolCalls: true,
    supportsStreaming: true,
    maxOutputTokens: 8_192,
  };
}

/** Parse a newline/comma-separated list of model ids into ModelDefs. */
function parseCustomModels(raw: string): ModelDef[] {
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((id) => minimalModel(id, 'Custom'));
}

export function OpenAICompatibleFlow({ onBack, onClose, onSaved, editingMeta }: FlowProps) {
  const editing = !!editingMeta;

  const [presetId, setPresetId] = useState(
    editingMeta?.presetId ?? OPENAI_COMPATIBLE_PRESETS[0].id,
  );
  const preset = getPreset(presetId);
  const isCustom = presetId === CUSTOM_PRESET_ID;

  const [name, setName] = useState(editingMeta?.name ?? preset?.name ?? 'OpenAI-compatible');
  const [baseUrl, setBaseUrl] = useState(editingMeta?.baseUrl ?? preset?.baseUrl ?? '');
  const [apiKey, setApiKey] = useState('');
  const [customModels, setCustomModels] = useState(
    editing && editingMeta?.presetId === CUSTOM_PRESET_ID
      ? editingMeta.models.map((m) => m.id).join('\n')
      : '',
  );

  // Live ids discovered from the provider's /v1/models endpoint, merged onto
  // preset metadata (preset models keep rich fields; extras get safe defaults).
  const [fetchedIds, setFetchedIds] = useState<string[]>([]);
  const [fetching, setFetching] = useState(false);
  const [fetchNote, setFetchNote] = useState<string | null>(null);

  // Models offered for the "default model" picker.
  const models: ModelDef[] = useMemo(() => {
    if (editing) return editingMeta!.models;
    const base = isCustom ? parseCustomModels(customModels) : (preset?.models ?? []);
    if (fetchedIds.length === 0) return base;
    const known = new Set(base.map((m) => m.id));
    return [...base, ...fetchedIds.filter((id) => !known.has(id)).map((id) => minimalModel(id))];
  }, [editing, editingMeta, isCustom, customModels, preset, fetchedIds]);

  const [model, setModel] = useState(editingMeta?.defaultModel ?? '');
  const effectiveModel = model || models[0]?.id || '';

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [tested, setTested] = useState(false);

  // Switching preset: refresh name/baseUrl/model so the form follows the choice.
  const onPickPreset = (id: string) => {
    setPresetId(id);
    setTested(false);
    setError(null);
    setFetchedIds([]);
    setFetchNote(null);
    const p = getPreset(id);
    if (p && id !== CUSTOM_PRESET_ID) {
      setName(p.name);
      setBaseUrl(p.baseUrl);
      setModel(p.models[0]?.id ?? '');
    } else {
      setBaseUrl('');
      setModel('');
    }
  };

  const fetchModels = async () => {
    setFetchNote(null);
    const url = baseUrl.trim().replace(/\/+$/, '');
    if (!/^https?:\/\//.test(url)) {
      setFetchNote('Enter a valid base URL first.');
      return;
    }
    setFetching(true);
    try {
      const res = await window.api.connections.listRemoteModels({
        baseUrl: url,
        apiKey: apiKey.trim() || undefined,
      });
      if ('error' in res) {
        setFetchNote(res.error);
        return;
      }
      setFetchedIds(res.ids);
      const known = new Set((isCustom ? [] : preset?.models ?? []).map((m) => m.id));
      const added = res.ids.filter((id) => !known.has(id)).length;
      setFetchNote(
        `Found ${res.ids.length} model${res.ids.length === 1 ? '' : 's'}` +
          (added ? ` (+${added} new)` : ''),
      );
    } finally {
      setFetching(false);
    }
  };

  const submit = async () => {
    setError(null);
    if (!name.trim()) return setError('Name is required.');
    const url = baseUrl.trim().replace(/\/+$/, '');
    if (!/^https?:\/\//.test(url)) return setError('Base URL must start with http(s)://');
    if (models.length === 0) return setError('Add at least one model id.');
    if (!effectiveModel) return setError('Select a default model.');
    if (!apiKey.trim()) return setError('API key is required.');

    setSaving(true);
    try {
      const meta: ConnectionMeta = editing
        ? { ...editingMeta!, name: name.trim(), defaultModel: effectiveModel }
        : {
            slug: generateSlug(name),
            name: name.trim(),
            providerType: 'openai-compatible',
            authType: 'api_key',
            baseUrl: url,
            presetId,
            defaultModel: effectiveModel,
            models,
            createdAt: Date.now(),
          };
      const credential: Credential = {
        type: 'api_key',
        apiKey: apiKey.trim(),
      };
      await saveConnection(meta, credential);

      // Validate the key with a real round-trip (main process, no CORS).
      const result = await window.api.connections.test(meta.slug);
      if (!result.ok) {
        setError(result.error.message ?? 'Connection test failed. Check the API key and base URL.');
        setSaving(false);
        return;
      }
      setTested(true);
      onSaved(meta);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save connection.');
      setSaving(false);
    }
  };

  return (
    <FormShell title={editing ? 'Update API key' : 'OpenAI-compatible provider'} onBack={onBack}>
      {!editing && (
        <Field label="Provider">
          <Select
            value={presetId}
            onChange={onPickPreset}
            options={OPENAI_COMPATIBLE_PRESETS.map((p) => ({ value: p.id, label: p.name }))}
          />
        </Field>
      )}

      {preset && !isCustom && !editing && (
        <p className="text-xs text-fg-subtle">{preset.blurb}</p>
      )}

      <Field label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="StepFun" />
      </Field>

      {(isCustom || editing) && (
        <Field label="Base URL" hint="OpenAI-compatible endpoint, including the version path (e.g. /v1).">
          <Input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.stepfun.ai/v1"
            mono
            disabled={editing}
          />
        </Field>
      )}

      {isCustom && !editing && (
        <Field label="Model ids" hint="One per line. These are passed verbatim to the API.">
          <Textarea
            value={customModels}
            onChange={(e) => setCustomModels(e.target.value)}
            placeholder={'step-3.7-flash\nstep-3.5-flash'}
            rows={3}
            mono
          />
        </Field>
      )}

      <Field
        label="API key"
        hint={preset?.keyHint ?? 'Stored encrypted via the OS keychain.'}
      >
        <PasswordInput
          value={apiKey}
          onChange={(e) => {
            setApiKey(e.target.value);
            setTested(false);
          }}
          autoComplete="off"
          placeholder={editing ? 'Enter a new key to replace the stored one' : 'Paste your API key'}
        />
      </Field>

      {preset?.keyUrl && (
        <a
          href={preset.keyUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
        >
          Get an API key <ExternalLink className="h-3 w-3" />
        </a>
      )}

      {!editing && (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={fetchModels}
            loading={fetching}
            disabled={!baseUrl.trim()}
          >
            Fetch models from API
          </Button>
          {fetchNote && <span className="text-xs text-fg-subtle">{fetchNote}</span>}
        </div>
      )}

      {models.length > 0 && (
        <Field label="Default model">
          <Select
            value={effectiveModel}
            onChange={setModel}
            options={models.map((m) => ({
              value: m.id,
              label: m.description ? `${m.name} — ${m.description}` : m.name,
            }))}
          />
        </Field>
      )}

      {error && <ErrorBox>{error}</ErrorBox>}
      {tested && (
        <p className="inline-flex items-center gap-1.5 text-xs text-green-400">
          <CheckCircle2 className="h-3.5 w-3.5" /> Connection verified.
        </p>
      )}

      <Actions>
        <Button variant="ghost" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button variant="primary" onClick={submit} loading={saving}>
          {editing ? 'Update key' : 'Save & verify'}
        </Button>
      </Actions>
    </FormShell>
  );
}
