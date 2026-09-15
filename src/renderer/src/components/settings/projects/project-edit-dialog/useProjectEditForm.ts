import { useState } from 'react';
import { createProject, updateProject } from '@/lib/projects';
import type { ConnectionMeta, PermissionMode, Project } from '@/lib/electron';
import { COLOR_PALETTE } from '../types';

export function useProjectEditForm(
  project: Project | null,
  connections: ConnectionMeta[],
  onClose: () => void,
) {
  const [name, setName] = useState(project?.name ?? '');
  const [rootPath, setRootPath] = useState(project?.rootPath ?? '');
  const [color, setColor] = useState(project?.color ?? COLOR_PALETTE[0]);
  const [defaultPermissionMode, setDefaultPermissionMode] = useState<PermissionMode | ''>(
    project?.defaultPermissionMode ?? '',
  );
  const [defaultConnectionSlug, setDefaultConnectionSlug] = useState<string>(
    project?.defaultConnectionSlug ?? '',
  );
  const [defaultAutonomyLevel, setDefaultAutonomyLevel] = useState<number | ''>(
    project?.defaultAutonomyLevel ?? '',
  );
  const [defaultModel, setDefaultModel] = useState<string>(project?.defaultModel ?? '');
  const [includeCoAuthoredBy, setIncludeCoAuthoredBy] = useState<'true' | 'false' | ''>(
    project?.includeCoAuthoredBy === undefined
      ? ''
      : project.includeCoAuthoredBy
        ? 'true'
        : 'false',
  );
  const [busy, setBusy] = useState(false);

  const isNew = project === null;
  const canSave = name.trim().length > 0 && rootPath.trim().length > 0;
  const slugMissing =
    !!project?.defaultConnectionSlug &&
    !connections.some((connection) => connection.slug === project.defaultConnectionSlug);
  const selectedConnection = connections.find(
    (connection) => connection.slug === defaultConnectionSlug,
  );

  const pickFolder = async () => {
    const picked = await window.api.fs.pickDirectory();
    if (picked) setRootPath(picked);
  };

  const save = async () => {
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
        defaultModel: selectedConnection?.models.some((model) => model.id === defaultModel)
          ? defaultModel
          : undefined,
        includeCoAuthoredBy:
          includeCoAuthoredBy === '' ? undefined : includeCoAuthoredBy === 'true',
      };
      if (isNew) await createProject(payload);
      else await updateProject(project.id, payload);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return {
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
    busy,
    canSave,
    slugMissing,
    selectedConnection,
    pickFolder,
    save,
  };
}

export type ProjectEditFormState = ReturnType<typeof useProjectEditForm>;
