import { useState } from 'react';
import {
  Download,
  Loader2,
  AlertCircle,
  FileText,
  FileStack,
  Link2,
} from 'lucide-react';
import { IconButton, Menu } from '../../ui';
import {
  loadFullSession,
  saveSessionExport,
  shareSessionExport,
} from '@/lib/sessions';
import { recordSharedLink, type SharedLinkRecord } from '@/lib/shared-links';
import { exportSessionHtml, type ExportMode, MODE_LABELS } from '@/lib/session-export';
import { ShareResultDialog } from './ShareResultDialog';

type State = 'idle' | 'working' | 'error';

// Transport label shown in parens on share items. When more transports are
// added (e.g. tmpfiles), the mode name stays constant and only this differs:
//   Conversation (BrewPage) / Conversation (tmpfiles).
const SHARE_TRANSPORT = 'BrewPage';

/** Download/share actions in the chat header rail: one click per mode straight
 *  to a native Save dialog, or to an ephemeral share link. */
export function ExportMenu({ sessionId }: { sessionId: string | null }) {
  const [state, setState] = useState<State>('idle');
  const [shared, setShared] = useState<SharedLinkRecord | null>(null);

  async function generate(mode: ExportMode) {
    if (!sessionId) return null;
    const data = await loadFullSession(sessionId);
    if (!data) throw new Error('Session could not be loaded.');
    return exportSessionHtml(data.meta, data.messages, { mode });
  }

  async function save(mode: ExportMode) {
    if (!sessionId || state === 'working') return;
    setState('working');
    try {
      const out = await generate(mode);
      if (out) await saveSessionExport(out.html, out.suggestedName);
      setState('idle');
    } catch {
      flashError();
    }
  }

  async function share(mode: ExportMode) {
    if (!sessionId || state === 'working') return;
    setState('working');
    try {
      const out = await generate(mode);
      if (!out) return;
      const result = await shareSessionExport(out.html, out.suggestedName);
      setShared(recordSharedLink(sessionId, mode, result));
      setState('idle');
    } catch {
      flashError();
    }
  }

  function flashError() {
    setState('error');
    setTimeout(() => setState('idle'), 3000);
  }

  const icon = state === 'working' ? Loader2 : state === 'error' ? AlertCircle : Download;
  const label =
    state === 'working' ? 'Working…'
    : state === 'error' ? 'Export failed — try again'
    : 'Export session…';

  const trigger = (
    <IconButton
      icon={icon}
      label={label}
      disabled={!sessionId || state === 'working'}
      iconClassName={
        state === 'working' ? 'animate-spin' : state === 'error' ? 'text-red-400' : undefined
      }
    />
  );

  return (
    <>
      <Menu
        trigger={trigger}
        menuWidth={224}
        footer="Paths & secrets stripped. Shared links are unlisted and expire in 15 days."
        items={[
          { header: 'Save to file' },
          { label: `${MODE_LABELS.summary} (.html)`, icon: FileText, onSelect: () => void save('summary') },
          { label: `${MODE_LABELS.full} (.html)`, icon: FileStack, onSelect: () => void save('full') },
          'separator',
          { header: 'Share link' },
          { label: `${MODE_LABELS.summary} (${SHARE_TRANSPORT})`, icon: Link2, onSelect: () => void share('summary') },
          { label: `${MODE_LABELS.full} (${SHARE_TRANSPORT})`, icon: Link2, onSelect: () => void share('full') },
        ]}
      />
      {shared && (
        <ShareResultDialog record={shared} onClose={() => setShared(null)} />
      )}
    </>
  );
}
