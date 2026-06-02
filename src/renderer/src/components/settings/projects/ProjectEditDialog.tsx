import { useState } from 'react';
import { FolderOpen } from 'lucide-react';
import { useAiData } from '@/hooks/useAiData';
import { createProject, updateProject } from '@/lib/projects';
import { Button, Field, Input, Select } from '@/components/ui';
import { COLOR_PALETTE, type ProjectEditDialogProps } from './types';
import type { PermissionMode } from '@/lib/electron';

/**
 * Edit/create project dialog (inline modal).
 */
export function ProjectEditDialog({ project, onClose }: ProjectEditDialogProps) {
  const aiData = useAiData();
  const connections = aiData?.connections ?? [];
  const [name, setName] = useState(project?.name ?? '');
  const [rootPath, setRootPath] = useState(project?.rootPath ?? '');
  const [color, setColor] = useState(project?.color ?? COLOR_PALETTE[0]);
  const [defaultPermissionMode, setDefaultPermissionMode] = useState<
    PermissionMode | ''
  >(project?.defaultPermissionMode ?? '');
  const [defaultConnectionSlug, setDefaultConnectionSlug] = useState<string>(
    project?.defaultConnectionSlug ?? '',
  );
  const [defaultAutonomyLevel, setDefaultAutonomyLevel] = useState<number | ''>(
    project?.defaultAutonomyLevel ?? '',
  );
  const [defaultModel, setDefaultModel] = useState<string>(
    project?.defaultModel ?? '',
  );
  const [includeCoAuthoredBy, setIncludeCoAuthoredBy] = useState<
    'true' | 'false' | ''
  >(
    project?.includeCoAuthoredBy === undefined
      ? ''
      : project.includeCoAuthoredBy
        ? 'true'
        : 'false',
  );
  const [busy, setBusy] = useState(false);

  // Detect if stored slug points to a deleted connection
  const slugMissing =
    !!project?.defaultConnectionSlug &&
    !connections.some((c) => c.slug === project.defaultConnectionSlug);

  const isNew = project === null;
  const canSave = name.trim().length > 0 && rootPath.trim().length > 0;

  const handlePickFolder = async () => {
    const picked = await window.api.fs.pickDirectory();
    if (picked) setRootPath(picked);
  };

  const handleSave = async () => {
    if (!canSave) return;
    setBusy(true);
    try {
      const payload = {
        name: name.trim(),
        rootPath: rootPath.trim(),
        color,
        defaultPermissionMode: defaultPermissionMode || undefined,
        defaultConnectionSlug: defaultConnectionSlug || undefined,
        defaultAutonomyLevel: defaultAutonomyLevel === '' ? undefined : defaultAutonomyLevel,
        defaultModel: defaultModel || undefined,
        includeCoAuthoredBy:
          includeCoAuthoredBy === '' ? undefined : includeCoAuthoredBy === 'true',
      };
      if (isNew) await createProject(payload);
      else await updateProject(project!.id, payload);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-border bg-panel p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-base font-semibold text-fg">
          {isNew ? 'New project' : `Edit ${project!.name}`}
        </h3>

        <div className="flex flex-col gap-3">
          <Field label="Name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Work · Backend"
              autoFocus
            />
          </Field>

          <Field label="Root path" hint="Sessions opened under this folder auto-join the project.">
            <div className="flex gap-2">
              <Input
                value={rootPath}
                onChange={(e) => setRootPath(e.target.value)}
                placeholder="/Users/you/Workspaces/project"
                className="flex-1"
              />
              <Button
                variant="outline"
                size="sm"
                icon={FolderOpen}
                onClick={handlePickFolder}
              >
                Pick
              </Button>
            </div>
          </Field>

          <Field label="Color">
            <div className="flex flex-wrap gap-2">
              {COLOR_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="h-6 w-6 rounded-full ring-1 ring-border transition-transform hover:scale-110"
                  style={{
                    backgroundColor: c,
                    outline: color === c ? '2px solid var(--color-fg)' : 'none',
                    outlineOffset: 2,
                  }}
                  aria-label={`color ${c}`}
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
              onChange={(v) =>
                setDefaultPermissionMode(v as PermissionMode | '')
              }
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
                onChange={(e) => setDefaultAutonomyLevel(Number(e.target.value))}
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
            label="Default model"
            hint="Model to use for new sessions in this project. Falls back to connection's default or global default."
          >
            <Select
              value={defaultModel}
              onChange={(v) => setDefaultModel(v)}
              options={[
                { value: '', label: 'Use connection/global default' },
                ...connections.flatMap((c) =>
                  c.models.map((m) => ({
                    value: m.id,
                    label: `${c.name}: ${m.name}`,
                  })),
                ),
              ]}
            />
          </Field>

          <Field
            label="Default connection"
            hint="Sessions in this project use this connection's default model. Falls back to the global default if missing."
          >
            <Select
              value={defaultConnectionSlug}
              onChange={(v) => setDefaultConnectionSlug(v)}
              options={[
                { value: '', label: 'Use global default' },
                ...connections.map((c) => ({
                  value: c.slug,
                  label: c.name,
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
            label="Co-Authored-By trailer"
            hint="Whether to append the Minimalist Agent co-author trailer to commits. Overrides the global preference for this project."
          >
            <Select
              value={includeCoAuthoredBy}
              onChange={(v) => setIncludeCoAuthoredBy(v as 'true' | 'false' | '')}
              options={[
                { value: '', label: 'Use global default' },
                { value: 'true', label: 'On' },
                { value: 'false', label: 'Off' },
              ]}
            />
          </Field>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => void handleSave()}
            disabled={!canSave || busy}
          >
            {isNew ? 'Create' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}
