import { useEffect, useState } from 'react';
import { HelpCircle, Megaphone, SquareTerminal } from 'lucide-react';
import { IconButton } from '@/components/ui';
import { hasUnseenChangelog, markChangelogSeen } from '@/lib/changelog';
import { WhatsNewDialog } from '../WhatsNewDialog';

interface ActionButtonsProps {
  terminalOpen: boolean;
  onToggleTerminal: () => void;
}

export function ActionButtons({ terminalOpen, onToggleTerminal }: ActionButtonsProps) {
  return (
    <div className="titlebar-no-drag flex items-center gap-0.5">
      <IconButton
        icon={SquareTerminal}
        label="Toggle terminal (Cmd+T)"
        onClick={onToggleTerminal}
        className={terminalOpen ? 'text-accent' : ''}
      />
      <WhatsNewButton />
      <IconButton icon={HelpCircle} label="Help" />
    </div>
  );
}

function WhatsNewButton() {
  const [open, setOpen] = useState(false);
  const [unseen, setUnseen] = useState(false);

  useEffect(() => {
    setUnseen(hasUnseenChangelog());
  }, []);

  const handleOpen = () => {
    setOpen(true);
    markChangelogSeen();
    setUnseen(false);
  };

  return (
    <>
      <div className="relative">
        <IconButton icon={Megaphone} label="What's new" onClick={handleOpen} />
        {unseen && (
          <span
            aria-hidden
            className="pointer-events-none absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-accent ring-2 ring-app"
          />
        )}
      </div>
      {open && <WhatsNewDialog onClose={() => setOpen(false)} />}
    </>
  );
}
