import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { generateSlug, saveConnection } from '@/lib/connections';
import type { ConnectionMeta, Credential } from '@/lib/electron';
import { Button, Field, Input, Select } from '@/components/ui';
import { Actions, ErrorBox, FormShell } from './shared';
import type { FlowProps } from './types';

const DEFAULT_BASE_URL = 'http://localhost:11434';

interface OllamaModel { name: string; size: number }
type Status = 'checking' | 'running' | 'offline';

async function probeOllama(url: string): Promise<{ status: Status; models: OllamaModel[] }> {
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return { status: 'offline', models: [] };
    const data = await res.json() as { models?: OllamaModel[] };
    return { status: 'running', models: data.models ?? [] };
  } catch {
    return { status: 'offline', models: [] };
  }
}

function fmt(bytes: number): string {
  const gb = bytes / 1024 / 1024 / 1024;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}

export function LocalModelFlow({ onBack, onClose, onSaved, editingMeta }: FlowProps) {
  const editing = !!editingMeta;
  const [name, setName] = useState(editingMeta?.name ?? 'Local Model');
  const [url, setUrl] = useState(editingMeta?.baseUrl ?? DEFAULT_BASE_URL);
  const [status, setStatus] = useState<Status>('checking');
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [model, setModel] = useState(editingMeta?.defaultModel ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const probe = async (target: string) => {
    setStatus('checking');
    const r = await probeOllama(target);
    setStatus(r.status);
    setModels(r.models);
    if (r.models.length > 0 && !model) setModel(r.models[0].name);
  };

  // Probe immediately on mount, then debounce on URL changes.
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => void probe(url), 400);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [url]);

  const submit = async () => {
    setError(null);
    if (!name.trim()) return setError('Name is required.');
    if (status !== 'running') return setError('Ollama is not reachable at that URL.');
    if (!model) return setError('Select a model.');
    setSaving(true);
    try {
      const modelDefs = models.map((m) => ({
        id: m.name,
        name: m.name,
        shortName: m.name.split(':')[0],
        description: `${fmt(m.size)} · local`,
        contextWindow: 131_072,
      }));
      const effectiveUrl = url.trim() || DEFAULT_BASE_URL;
      const meta: ConnectionMeta = editing
        ? { ...editingMeta!, name: name.trim(), baseUrl: effectiveUrl, defaultModel: model, models: modelDefs }
        : {
            slug: generateSlug(name),
            name: name.trim(),
            providerType: 'local',
            authType: 'api_key',
            baseUrl: effectiveUrl,
            defaultModel: model,
            models: modelDefs,
            createdAt: Date.now(),
          };
      const credential: Credential = { type: 'api_key', apiKey: 'local' };
      await saveConnection(meta, credential);
      onSaved(meta);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormShell title="Local Model" onBack={onBack}>
      <Field label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Local Model" />
      </Field>

      <Field
        label="Ollama URL"
        hint="Change if you set OLLAMA_HOST or run Ollama on another machine."
      >
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={DEFAULT_BASE_URL}
          mono
        />
      </Field>

      {/* Live status */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-elevated/30 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${
            status === 'running'  ? 'bg-green-500' :
            status === 'offline'  ? 'bg-red-500' :
            'bg-yellow-500 animate-pulse'
          }`} />
          <span className="text-xs text-fg-muted">
            {status === 'running'  ? `Running · ${models.length} model${models.length !== 1 ? 's' : ''} installed` :
             status === 'offline'  ? 'Not reachable' :
             'Checking…'}
          </span>
        </div>
        <Button variant="ghost" icon={RefreshCw} onClick={() => void probe(url)} disabled={status === 'checking'}>
          Retry
        </Button>
      </div>

      {status === 'offline' && (
        <div className="space-y-1 text-xs text-fg-subtle">
          <p>Start Ollama, then click Retry:</p>
          <code className="block rounded bg-elevated px-2 py-1 text-fg-muted">ollama serve</code>
          <p className="pt-1">
            No models?{' '}
            <code className="rounded bg-elevated px-1 text-fg-muted">ollama pull qwen3:14b</code>
          </p>
        </div>
      )}

      {status === 'running' && models.length === 0 && (
        <p className="text-xs text-fg-subtle">
          Ollama is running but no models are installed.{' '}
          <code className="rounded bg-elevated px-1 text-fg-muted">ollama pull qwen3:14b</code>
        </p>
      )}

      {status === 'running' && models.length > 0 && (
        <Field label="Default model">
          <Select
            value={model}
            onChange={setModel}
            options={models.map((m) => ({ value: m.name, label: `${m.name} · ${fmt(m.size)}` }))}
          />
        </Field>
      )}

      {error && <ErrorBox>{error}</ErrorBox>}

      <Actions>
        <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button
          variant="primary"
          onClick={submit}
          loading={saving}
          disabled={status !== 'running' || models.length === 0}
        >
          {editing ? 'Update connection' : 'Save connection'}
        </Button>
      </Actions>
    </FormShell>
  );
}
