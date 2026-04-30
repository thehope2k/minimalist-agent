import {
  CheckCircle2,
  FolderOpen,
  MoreHorizontal,
  Pencil,
  Power,
  Trash2,
} from 'lucide-react';
import { IconButton, Menu, type MenuItem } from '../ui';
import {
  deleteExtension as deleteExtensionRpc,
  displayName,
  isEnabled,
  openInEditor,
  revealInFinder,
  setEnabled,
  validate as validateRpc,
} from '@/lib/extensions';
import type { LoadedExtension } from '@/lib/electron';

type Props = {
  extension: LoadedExtension;
  onAfterDelete?: () => void;
  variant?: 'panel' | 'header';
  onOpenChange?: (open: boolean) => void;
};

export function ExtensionMenu({
  extension,
  onAfterDelete,
  variant = 'panel',
  onOpenChange,
}: Props) {
  const enabled = isEnabled(extension);

  const handleOpen = () => void openInEditor(extension.path);
  const handleReveal = () => void revealInFinder(extension.path);

  const handleValidate = async () => {
    const { ok, report } = await validateRpc(extension.path, extension.slug);
    window.alert(`${ok ? 'Extension OK' : 'Validation failed'}\n\n${report}`);
  };

  const handleToggle = () => void setEnabled(extension.slug, !enabled);

  const handleDelete = async () => {
    if (
      !window.confirm(
        `Delete extension "${displayName(extension)}" (slug: ${extension.slug})?\n\n` +
          `This will remove ${extension.path} and cannot be undone.`,
      )
    ) {
      return;
    }
    const ok = await deleteExtensionRpc(extension.slug);
    if (ok) onAfterDelete?.();
    else window.alert('Failed to delete extension.');
  };

  const items: Array<MenuItem | 'separator'> = [
    {
      label: enabled ? 'Disable' : 'Enable',
      icon: Power,
      onSelect: handleToggle,
    },
    'separator',
    { label: 'Open in editor', icon: Pencil, onSelect: handleOpen },
    { label: 'Show in Finder', icon: FolderOpen, onSelect: handleReveal },
    { label: 'Validate', icon: CheckCircle2, onSelect: handleValidate },
    'separator',
    {
      label: 'Delete',
      icon: Trash2,
      variant: 'destructive',
      onSelect: handleDelete,
    },
  ];

  return (
    <Menu
      onOpenChange={onOpenChange}
      trigger={
        <IconButton
          icon={MoreHorizontal}
          label="More"
          size="sm"
          className={
            variant === 'panel'
              ? 'bg-elevated/80 hover:bg-elevated-2'
              : 'hover:bg-elevated'
          }
        />
      }
      items={items}
    />
  );
}
