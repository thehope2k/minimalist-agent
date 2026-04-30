// Container for an assistant message. The outer chat scroll handles
// pinning to bottom on stream, so this is just a styled wrapper now.
//
// We previously capped height at 50vh with an Expand/Collapse button. The
// affordance proved buggy in practice (escape/blur interactions) and the
// minimalist UX is fine without it — long turns just scroll in the chat.

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function AssistantCard({ children }: { children: ReactNode }) {
  return (
    <div
      className={cn(
        'w-full rounded-2xl border border-border/40 bg-elevated/40 px-4 py-3 text-fg',
        'space-y-2',
      )}
    >
      {children}
    </div>
  );
}
