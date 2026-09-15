import { useMemo, useState } from 'react';
import { generateSlug, saveConnection } from '@/lib/connections';
import type { ConnectionMeta, Credential } from '@/lib/electron';
import type { ModelDef } from '@/lib/models';
import {
  CUSTOM_PRESET_ID,
  OPENAI_COMPATIBLE_PRESETS,
  getPreset,
} from '@/lib/openai-compatible-presets';
import type { FlowProps } from '../types';

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

function parseCustomModels(raw: string): ModelDef[] {
  return raw
    .split(/[\n,]+/)
    .map((id) => id.trim())
    .filter(Boolean)
    .map((id) => minimalModel(id, 'Custom'));
}

export function useOpenAICompatibleForm({
  editingMeta,
  onSaved,
  onClose,
}: Pick<FlowProps, 'editingMeta' | 'onSaved' | 'onClose'>) {
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
      ? editingMeta.models.map((model) => model.id).join('\n')
      : '',
  );
  const [fetchedIds, setFetchedIds] = useState<string[]>([]);
  const [fetching, setFetching] = useState(false);
  const [fetchNote, setFetchNote] = useState<string | null>(null);
  const [model, setModel] = useState(editingMeta?.defaultModel ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [tested, setTested] = useState(false);

  const models = useMemo(() => {
    if (editing) return editingMeta!.models;
    const base = isCustom ? parseCustomModels(customModels) : (preset?.models ?? []);
    const known = new Set(base.map((current) => current.id));
    const discovered = fetchedIds
      .filter((id) => !known.has(id))
      .map((id) => minimalModel(id));
    return [...base, ...discovered];
  }, [customModels, editing, editingMeta, fetchedIds, isCustom, preset]);
  const effectiveModel = model || models[0]?.id || '';

  const pickPreset = (id: string) => {
    setPresetId(id);
    setTested(false);
    setError(null);
    setFetchedIds([]);
    setFetchNote(null);
    const nextPreset = getPreset(id);
    if (nextPreset && id !== CUSTOM_PRESET_ID) {
      setName(nextPreset.name);
      setBaseUrl(nextPreset.baseUrl);
      setModel(nextPreset.models[0]?.id ?? '');
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
      const result = await window.api.connections.listRemoteModels({
        baseUrl: url,
        apiKey: apiKey.trim() || undefined,
      });
      if ('error' in result) {
        setFetchNote(result.error);
        return;
      }

      setFetchedIds(result.ids);
      const known = new Set((isCustom ? [] : preset?.models ?? []).map((current) => current.id));
      const added = result.ids.filter((id) => !known.has(id)).length;
      setFetchNote(
        `Found ${result.ids.length} model${result.ids.length === 1 ? '' : 's'}` +
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
            baseUrl: url,
            presetId,
            defaultModel: effectiveModel,
            models,
            createdAt: Date.now(),
          };
      const credential: Credential = { type: 'api_key', apiKey: apiKey.trim() };
      await saveConnection(meta, credential);
      const result = await window.api.connections.test(meta.slug);
      if (!result.ok) {
        setError(result.error.message ?? 'Connection test failed. Check the API key and base URL.');
        setSaving(false);
        return;
      }
      setTested(true);
      onSaved(meta);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to save connection.');
      setSaving(false);
    }
  };

  return {
    editing,
    preset,
    isCustom,
    presetId,
    name,
    baseUrl,
    apiKey,
    customModels,
    models,
    effectiveModel,
    fetching,
    fetchNote,
    error,
    saving,
    tested,
    setName,
    setBaseUrl,
    setApiKey: (value: string) => {
      setApiKey(value);
      setTested(false);
    },
    setCustomModels,
    setModel,
    pickPreset,
    fetchModels,
    submit,
  };
}
