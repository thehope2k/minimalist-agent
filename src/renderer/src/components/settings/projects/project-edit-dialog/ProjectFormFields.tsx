import { FolderOpen } from 'lucide-react';
import { Button, Field, Input, Select } from '@/components/ui';
import type { ConnectionMeta, PermissionMode, Project } from '@/lib/electron';
import { COLOR_PALETTE } from '../types';
import type { ProjectEditFormState } from './useProjectEditForm';

interface ProjectFormFieldsProps {
  project: Project | null;
  connections: ConnectionMeta[];
  form: ProjectEditFormState;
}

export function ProjectFormFields({ project, connections, form }: ProjectFormFieldsProps) {
  const {
    name,
    setName,
    rootPath,
    setRootPath,
    color,
    setColor,
    defaultPermissionMode,
    setDefaultPermissionMode,
    defaultConnectionSlug,
    setDefaultConnectionSlug,
    defaultAutonomyLevel,
    setDefaultAutonomyLevel,
    defaultModel,
    setDefaultModel,
    includeCoAuthoredBy,
    setIncludeCoAuthoredBy,
    slugMissing,
    selectedConnection,
    pickFolder,
  } = form;

  return (
    <div className="flex flex-col gap-3">
      <Field label="Name">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Work · Backend"
          autoFocus
        />
      </Field>

      <Field label="Root path" hint="Sessions opened under this folder auto-join the project.">
        <div className="flex gap-2">
          <Input
            value={rootPath}
            onChange={(event) => setRootPath(event.target.value)}
            placeholder="/Users/you/Workspaces/project"
            className="flex-1"
          />
          <Button variant="outline" size="sm" icon={FolderOpen} onClick={pickFolder}>
            Pick
          </Button>
        </div>
      </Field>

      <Field label="Color">
        <div className="flex flex-wrap gap-2">
          {COLOR_PALETTE.map((paletteColor) => (
            <button
              key={paletteColor}
              type="button"
              onClick={() => setColor(paletteColor)}
              className="h-6 w-6 rounded-full ring-1 ring-border transition-transform hover:scale-110"
              style={{
                backgroundColor: paletteColor,
                outline: color === paletteColor ? '2px solid var(--color-fg)' : 'none',
                outlineOffset: 2,
              }}
              aria-label={`color ${paletteColor}`}
            />
          ))}
        </div>
      </Field>

      <Field
        label="Default permission mode"
        hint="Used when a session in this project hasn't picked its own mode."
      >
        <Select
          value={defaultPermissionMode}
          onChange={(value) => setDefaultPermissionMode(value as PermissionMode | '')}
          options={[
            { value: '', label: 'Use global default' },
            { value: 'plan', label: 'Plan' },
            { value: 'auto', label: 'Auto' },
          ]}
        />
      </Field>

      <Field
        label="Default autonomy level"
        hint="Autonomy level (0-100) for new sessions in this project. Higher = more independence."
      >
        <div className="flex items-center gap-3">
          <input
            type="range"
            min="0"
            max="100"
            step="10"
            value={defaultAutonomyLevel === '' ? 50 : defaultAutonomyLevel}
            onChange={(event) => setDefaultAutonomyLevel(Number(event.target.value))}
            disabled={defaultAutonomyLevel === ''}
            className="flex-1"
          />
          <span className="w-12 text-right text-sm text-fg">
            {defaultAutonomyLevel === '' ? '—' : `${defaultAutonomyLevel}%`}
          </span>
          <button
            type="button"
            onClick={() => setDefaultAutonomyLevel(defaultAutonomyLevel === '' ? 50 : '')}
            className="text-xs text-accent hover:underline"
          >
            {defaultAutonomyLevel === '' ? 'Set' : 'Clear'}
          </button>
        </div>
      </Field>

      <Field
        label="Default connection"
        hint="Sessions in this project use this connection's default model. Falls back to the global default if missing."
      >
        <Select
          value={defaultConnectionSlug}
          onChange={(value) => {
            setDefaultConnectionSlug(value);
            if (
              !connections
                .find((connection) => connection.slug === value)
                ?.models.some((model) => model.id === defaultModel)
            ) {
              setDefaultModel('');
            }
          }}
          options={[
            { value: '', label: 'Use global default' },
            ...connections.map((connection) => ({
              value: connection.slug,
              label: connection.name,
            })),
            ...(slugMissing
              ? [
                  {
                    value: project!.defaultConnectionSlug!,
                    label: `${project!.defaultConnectionSlug} (removed)`,
                  },
                ]
              : []),
          ]}
        />
      </Field>

      <Field
        label="Default model"
        hint={
          selectedConnection
            ? `Choose a model from ${selectedConnection.name}.`
            : 'Select a default connection first.'
        }
      >
        <Select
          value={defaultModel}
          onChange={setDefaultModel}
          disabled={!selectedConnection}
          placeholder="Select a connection first"
          menuWidth={360}
          options={[
            { value: '', label: 'Use connection default' },
            ...(selectedConnection?.models.map((model) => ({
              value: model.id,
              label: model.name,
              description: model.id,
            })) ?? []),
          ]}
        />
      </Field>

      <Field
        label="Co-Authored-By trailer"
        hint="Whether to append the Minimalist Agent co-author trailer to commits. Overrides the global preference for this project."
      >
        <Select
          value={includeCoAuthoredBy}
          onChange={(value) => setIncludeCoAuthoredBy(value as 'true' | 'false' | '')}
          options={[
            { value: '', label: 'Use global default' },
            { value: 'true', label: 'On' },
            { value: 'false', label: 'Off' },
          ]}
        />
      </Field>
    </div>
  );
}
