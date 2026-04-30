// Projects settings panel — list, create, edit, delete projects.
// Sessions auto-fall back to Inbox when their project is deleted (handled in main).

import { useState } from 'react';
import { FolderOpen, Pencil, Plus, Trash2 } from 'lucide-react';
import { useProjects } from '@/hooks/useProjects';
import { useSessions } from '@/hooks/useSessions';
import { useAiData } from '@/hooks/useAiData';
import {
  createProject,
  deleteProject as deleteProjectStore,
  updateProject,
} from '@/lib/projects';
import {
  Button,
  Field,
  IconButton,
  Input,
  Select,
} from '@/components/ui';
import { SettingsCard, SettingsSection } from '../SettingsPrimitives';
import type { PermissionMode, Project } from '@/lib/electron';

const COLOR_PALETTE = [
  '#4a90e2', // blue
  '#7c4dff', // purple
  '#22c55e', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#ec4899', // pink
  '#14b8a6', // teal
  '#94a3b8', // slate
];

export function ProjectsPanel() {
  const projects = useProjects();
  const sessions = useSessions();
  const aiData = useAiData();
  const [editing, setEditing] = useState<Project | 'new' | null>(null);

  if (projects === null) {
    return (
      <div className="mx-auto max-w-[760px] px-8 py-12 text-sm text-fg-subtle">
        Loading…
      </div>
    );
  }

  const connections = aiData?.connections ?? [];
  const sessionCount = (projectId: string): number =>
    (sessions ?? []).filter((s) => s.projectId === projectId).length;
  const connectionLabel = (slug: string): string => {
    const c = connections.find((c) => c.slug === slug);
    return c ? c.name : `${slug} (removed)`;
  };
  const permissionLabel = (mode: PermissionMode): string =>
    ({ plan: 'Plan', ask: 'Ask', auto: 'Auto' })[mode];

  const handleDelete = async (proj: Project) => {
    const count = sessionCount(proj.id);
    const tail =
      count > 0
        ? `\n\n${count} session${count === 1 ? '' : 's'} will move to Inbox.`
        : '';
    if (!window.confirm(`Delete project "${proj.name}"?${tail}`)) return;
    await deleteProjectStore(proj.id);
  };

  return (
    <div className="mx-auto max-w-[760px] px-8 py-10">
      <SettingsSection
        title="Projects"
        subtitle="Group sessions by project. New sessions auto-assign by working directory."
      >
        <SettingsCard>
          {projects.length === 0 ? (
            <div className="px-4 py-6 text-sm text-fg-subtle">
              No projects yet. Sessions go to Inbox until you create one.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {projects.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: p.color ?? 'var(--color-accent)' }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-fg">
                      {p.name}
                    </div>
                    <div className="truncate text-xs text-fg-subtle">
                      {p.rootPath}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <ProjectChip
                        prefix="Mode"
                        label={
                          p.defaultPermissionMode
                            ? permissionLabel(p.defaultPermissionMode)
                            : 'Default'
                        }
                        muted={!p.defaultPermissionMode}
                      />
                      <ProjectChip
                        prefix="Connection"
                        label={
                          p.defaultConnectionSlug
                            ? connectionLabel(p.defaultConnectionSlug)
                            : 'Default'
                        }
                        muted={!p.defaultConnectionSlug}
                      />
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-fg-subtle">
                    {sessionCount(p.id)} session
                    {sessionCount(p.id) === 1 ? '' : 's'}
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    <IconButton
                      icon={Pencil}
                      label="Edit"
                      size="sm"
                      onClick={() => setEditing(p)}
                    />
                    <IconButton
                      icon={Trash2}
                      label="Delete"
                      size="sm"
                      onClick={() => void handleDelete(p)}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-border px-4 py-3">
            <Button
              variant="outline"
              size="sm"
              icon={Plus}
              onClick={() => setEditing('new')}
            >
              New project
            </Button>
          </div>
        </SettingsCard>
      </SettingsSection>

      {editing && (
        <ProjectEditDialog
          project={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function ProjectChip({
  prefix,
  label,
  muted,
}: {
  prefix: string;
  label: string;
  muted?: boolean;
}) {
  return (
    <span className="inline-flex items-center overflow-hidden rounded-md border border-border-strong text-[10px] font-medium leading-none">
      <span className="bg-elevated px-1.5 py-1 text-fg-subtle">
        {prefix}
      </span>
      <span
        className={
          muted
            ? 'bg-elevated-2 px-1.5 py-1 italic text-fg-subtle'
            : 'bg-elevated-2 px-1.5 py-1 text-fg'
        }
      >
        {label}
      </span>
    </span>
  );
}

/* ---------- edit dialog (inline modal) ---------- */

function ProjectEditDialog({
  project,
  onClose,
}: {
  project: Project | null;
  onClose: () => void;
}) {
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
  const [busy, setBusy] = useState(false);

  // The stored slug may point at a deleted connection. Detect so we can
  // warn the user inline rather than silently letting the resolver fall
  // back to the global default.
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
                { value: 'ask', label: 'Ask' },
                { value: 'auto', label: 'Auto' },
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
