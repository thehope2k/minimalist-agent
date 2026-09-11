import { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { generateSlug, saveConnection } from '@/lib/connections';
import type { ConnectionMeta, Credential, ModelDef } from '@/lib/electron';
import { Badge, Button, Field, Input, Select } from '@/components/ui';
import { Actions, ErrorBox, FormShell } from './shared';
import type { FlowProps } from './types';

const DEFAULT_CONNECTION_NAME = 'CodeMie SSO';
const EPAM_CODEMIE_API_URL = 'https://codemie.lab.epam.com/code-assistant-api';
type Integration = { id: string; alias: string };

function normalizeUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function isSecureUrl(value: string): boolean {
  return /^https:\/\//.test(value);
}

export function CodeMieSsoFlow({ onBack, onClose, onSaved, editingMeta }: FlowProps) {
  const editing = Boolean(editingMeta);
  const [name, setName] = useState(editingMeta?.name ?? DEFAULT_CONNECTION_NAME);
  const [baseUrl, setBaseUrl] = useState(editingMeta?.baseUrl ?? EPAM_CODEMIE_API_URL);
  const [projects, setProjects] = useState<string[]>([]);
  const [project, setProject] = useState(editingMeta?.codeMieProject ?? '');
  const [integrationsByProject, setIntegrationsByProject] = useState<Record<string, Integration[]>>({});
  const [integrationId, setIntegrationId] = useState(editingMeta?.codeMieIntegrationId ?? '');
  const [models, setModels] = useState<ModelDef[]>(editingMeta?.models ?? []);
  const [model, setModel] = useState(editingMeta?.defaultModel ?? '');
  const [credential, setCredential] = useState<Credential | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableIntegrations = integrationsByProject[project] ?? [];

  const signIn = async () => {
    const normalizedUrl = normalizeUrl(baseUrl);
    if (!isSecureUrl(normalizedUrl)) {
      setError('CodeMie URL must start with https://');
      return;
    }

    setError(null);
    setSigningIn(true);
    try {
      const session = await window.api.connections.signInWithCodeMie({ baseUrl: normalizedUrl });
      if (session.projects.length === 0) {
        setError('CodeMie returned no projects for this account. Contact your administrator.');
        return;
      }
      const discoveredModels = session.models;
      const selectedProject = session.projects.includes(project) ? project : session.projects[0];
      const projectIntegrations = session.integrations[selectedProject] ?? [];
      setModels(discoveredModels);
      setModel(discoveredModels[0]?.id ?? '');
      setProjects(session.projects);
      setProject(selectedProject);
      setIntegrationsByProject(session.integrations);
      setIntegrationId(projectIntegrations.some(({ id }) => id === integrationId) ? integrationId : projectIntegrations[0]?.id ?? '');
      setCredential({ type: 'codemie_sso', cookies: session.cookies, expiresAt: session.expiresAt });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'CodeMie sign-in failed.');
    } finally {
      setSigningIn(false);
    }
  };

  const selectProject = (selectedProject: string) => {
    setProject(selectedProject);
    setIntegrationId(integrationsByProject[selectedProject]?.[0]?.id ?? '');
  };

  const save = async () => {
    if (!credential || !model || models.length === 0 || !name.trim() || !project) return;

    const connection: ConnectionMeta = editing
      ? {
          ...editingMeta!,
          name: name.trim(),
          baseUrl: normalizeUrl(baseUrl),
          codeMieProject: project,
          codeMieIntegrationId: integrationId || undefined,
          defaultModel: model,
          models,
          modelsFetchedAt: Date.now(),
        }
      : {
          slug: generateSlug(name),
          name: name.trim(),
          providerType: 'codemie-sso',
          baseUrl: normalizeUrl(baseUrl),
          codeMieProject: project,
          codeMieIntegrationId: integrationId || undefined,
          defaultModel: model,
          models,
          modelsFetchedAt: Date.now(),
          createdAt: Date.now(),
        };

    await saveConnection(connection, credential);
    onSaved(connection);
    onClose();
  };

  return (
    <FormShell title={editing ? 'Reconnect CodeMie SSO' : 'CodeMie SSO'} onBack={onBack}>
      <p className="text-xs text-fg-subtle">
        Sign in with EPAM SSO. Your CodeMie session is encrypted on this device.
      </p>
      <Field label="Name">
        <Input value={name} onChange={(event) => setName(event.target.value)} />
      </Field>
      <div className="flex items-center justify-between">
        <Button variant="primary" onClick={signIn} loading={signingIn}>
          Sign in with CodeMie
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon={SlidersHorizontal}
          onClick={() => setShowAdvanced((visible) => !visible)}
        >
          {showAdvanced ? 'Hide advanced options' : 'Advanced options'}
        </Button>
      </div>
      {showAdvanced && (
        <Field label="CodeMie API URL" hint="EPAM production is preselected. Change this only for preview or development.">
          <Input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} mono />
        </Field>
      )}
      {credential && (
        <div className="flex items-center gap-2 text-xs text-fg-muted">
          <Badge variant="accent">Connected</Badge>
          <span>{models.length} models available</span>
        </div>
      )}
      {projects.length > 0 && (
        <Field label="Project">
          <Select value={project} onChange={selectProject} options={projects.map((id) => ({ value: id, label: id }))} />
        </Field>
      )}
      {availableIntegrations.length > 0 && (
        <Field label="LiteLLM integration" hint="Optional model gateway configured for the selected project.">
          <Select
            value={integrationId}
            onChange={setIntegrationId}
            options={[{ value: '', label: 'None' }, ...availableIntegrations.map(({ id, alias }) => ({ value: id, label: alias }))]}
          />
        </Field>
      )}
      {models.length > 0 && (
        <Field label="Default model">
          <Select value={model} onChange={setModel} options={models.map((item) => ({ value: item.id, label: item.name }))} />
        </Field>
      )}
      {error && <ErrorBox>{error}</ErrorBox>}
      <Actions>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={save} disabled={!credential || !model || !project}>Save connection</Button>
      </Actions>
    </FormShell>
  );
}
