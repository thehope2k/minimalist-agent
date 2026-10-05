import { Plug } from 'lucide-react';
import { ExtensionHeader } from './extension-info-page/ExtensionHeader';
import { PageHeader } from './extension-info-page/PageHeader';
import { MetadataSection } from './extension-info-page/MetadataSection';
import { McpNoticeSection } from './extension-info-page/McpNoticeSection';
import { GuideSection } from './extension-info-page/GuideSection';
import { ConfigSection } from './extension-info-page/ConfigSection';
import { SetupSection } from './extension-info-page/SetupSection';
import { EditExtensionDialog } from './EditExtensionDialog';
import { useExtensionActions } from './extension-info-page/useExtensionActions';
import type { ExtensionInfoPageProps } from './extension-info-page/types';

export function ExtensionInfoPage({
  extension,
  onClose,
  onOpenFile,
  onStartChatWithSubmission,
}: ExtensionInfoPageProps) {
  if (!extension) return <EmptyView />;

  const { copied, copySlug, editMode, startEdit, closeEdit } = useExtensionActions(extension);
  const canEdit = !!onStartChatWithSubmission;

  return (
    <div className="flex h-full flex-col">
      <ExtensionHeader
        extension={extension}
        copied={copied}
        onCopySlug={copySlug}
        onAfterDelete={onClose}
      />

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1100px] space-y-6 px-6 py-6">
          <PageHeader extension={extension} />

          {extension.variant === 'mcp-backed' && <McpNoticeSection slug={extension.slug} />}

          <MetadataSection extension={extension} />

          <SetupSection
            extension={extension}
            onStartChatWithSubmission={onStartChatWithSubmission}
          />

          <GuideSection
            extension={extension}
            onOpenFile={onOpenFile}
            onEdit={canEdit ? () => startEdit('guide') : undefined}
          />

          <ConfigSection
            extension={extension}
            onEdit={canEdit ? () => startEdit('config') : undefined}
          />
        </div>
      </div>

      {editMode && (
        <EditExtensionDialog
          mode={editMode}
          extension={extension}
          onClose={closeEdit}
          onSubmit={(submit) => onStartChatWithSubmission?.(submit)}
        />
      )}
    </div>
  );
}

function EmptyView() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-fg-subtle">
      <Plug className="h-6 w-6" strokeWidth={1.5} />
      <p className="text-sm">Select an extension to view its details</p>
    </div>
  );
}
