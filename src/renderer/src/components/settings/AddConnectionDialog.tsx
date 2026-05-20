import { useState } from 'react';
import { X } from 'lucide-react';
import type { ConnectionMeta } from '@/lib/electron';
import { IconButton } from '@/components/ui';
import { ChooseScreen } from './connection-flow/ChooseScreen';
import { ApiKeyForm } from './connection-flow/ApiKeyForm';
import { ClaudeOAuthForm } from './connection-flow/ClaudeOAuthForm';
import { CopilotFlow } from './connection-flow/CopilotFlow';
import { ChatGptFlow } from './connection-flow/ChatGptFlow';
import { LocalModelFlow } from './connection-flow/LocalModelFlow';
import type { ConnectionKind } from './connection-flow/types';

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: (c: ConnectionMeta) => void;
  /** Mark the new connection as the default. */
  makeDefault?: boolean;
  /**
   * When set, the dialog opens in "edit credential" mode: skip the kind
   * picker, jump straight to the right form, and overwrite the credential
   * on the existing slug.
   */
  editingMeta?: ConnectionMeta;
};

function inferKind(meta: ConnectionMeta): ConnectionKind {
  if (meta.providerType === 'pi' && meta.piAuthProvider === 'github-copilot') {
    return 'github-copilot';
  }
  if (meta.providerType === 'pi' && meta.piAuthProvider === 'openai-codex') {
    return 'chatgpt-plus';
  }
  if (meta.providerType === 'local') return 'local';
  if (meta.authType === 'oauth') return 'claude-max';
  return 'other';
}

export function AddConnectionDialog({
  open,
  onClose,
  onSaved,
  makeDefault,
  editingMeta,
}: Props) {
  const [kind, setKind] = useState<ConnectionKind | null>(null);

  if (!open) return null;

  const handleClose = () => {
    void window.api?.claudeOAuth.cancel();
    setKind(null);
    onClose();
  };

  const flowProps = {
    onBack: editingMeta ? handleClose : () => setKind(null),
    onClose: handleClose,
    onSaved,
    makeDefault,
    editingMeta,
  };

  // In edit mode, skip the picker and go straight to the matching form.
  const activeKind = editingMeta ? inferKind(editingMeta) : kind;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="relative max-h-[88vh] w-140 overflow-y-auto rounded-xl border border-border bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <IconButton
          icon={X}
          label="Close"
          onClick={handleClose}
          className="absolute right-3 top-3 z-10"
        />

        {activeKind === null && <ChooseScreen onPick={setKind} />}
        {activeKind === 'other' && <ApiKeyForm {...flowProps} />}
        {activeKind === 'claude-max' && <ClaudeOAuthForm {...flowProps} />}
        {activeKind === 'github-copilot' && <CopilotFlow {...flowProps} />}
        {activeKind === 'chatgpt-plus' && <ChatGptFlow {...flowProps} />}
        {activeKind === 'local' && <LocalModelFlow {...flowProps} />}
      </div>
    </div>
  );
}
