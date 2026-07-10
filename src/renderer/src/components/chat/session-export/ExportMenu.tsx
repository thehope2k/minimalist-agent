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

// Transport labels shown in parens on share items.
const TRANSPORTS = {
  brewpage: 'BrewPage',
  meethtml: 'meethtml',
} as const;
type Backend = keyof typeof TRANSPORTS;

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

  async function share(mode: ExportMode, backend: Backend) {
    if (!sessionId || state === 'working') return;
    setState('working');
    try {
      const out = await generate(mode);
      if (!out) return;
      const result = await shareSessionExport(out.html, out.suggestedName, undefined, backend);
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
        footer="Paths & secrets stripped. BrewPage links expire in 15 days; meethtml links expire in 24 hours."
        items={[
          { header: 'Save to file' },
          { label: `${MODE_LABELS.summary} (.html)`, icon: FileText, onSelect: () => void save('summary') },
          { label: `${MODE_LABELS.full} (.html)`, icon: FileStack, onSelect: () => void save('full') },
          'separator',
          { header: 'Share link' },
          { label: `${MODE_LABELS.summary} (${TRANSPORTS.brewpage})`, icon: Link2, onSelect: () => void share('summary', 'brewpage') },
          { label: `${MODE_LABELS.full} (${TRANSPORTS.brewpage})`, icon: Link2, onSelect: () => void share('full', 'brewpage') },
          { label: `${MODE_LABELS.summary} (${TRANSPORTS.meethtml})`, icon: Link2, onSelect: () => void share('summary', 'meethtml') },
          { label: `${MODE_LABELS.full} (${TRANSPORTS.meethtml})`, icon: Link2, onSelect: () => void share('full', 'meethtml') },
        ]}
      />
      {shared && (
        <ShareResultDialog record={shared} onClose={() => setShared(null)} />
      )}
    </>
  );
}
