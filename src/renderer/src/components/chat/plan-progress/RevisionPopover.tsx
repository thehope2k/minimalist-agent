import * as Popover from '@radix-ui/react-popover';
import { ArrowRight, History, X } from 'lucide-react';
import { Badge, Button, IconButton } from '@/components/ui';
import type { Plan, PlanRevision } from '@/lib/electron';

interface RevisionPopoverProps {
  plan: Plan;
}

const revisionDateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function RevisionEntry({
  revision,
  current,
  last,
}: {
  revision: PlanRevision;
  current: boolean;
  last: boolean;
}) {
  return (
    <div className="relative pl-5">
      <span className="absolute left-0 top-1.5 h-2 w-2 rounded-full bg-accent ring-4 ring-panel" />
      {!last && (
        <span className="absolute bottom-[-18px] left-[3px] top-3.5 w-px bg-border" />
      )}

      <div className="rounded-lg border border-border/60 bg-elevated-1/40 p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-xs font-semibold text-fg">
            v{revision.version - 1}
          </span>
          <ArrowRight className="h-3 w-3 text-fg-subtle" />
          <span className="font-mono text-xs font-semibold text-accent">
            v{revision.version}
          </span>
          {current && <Badge variant="accent">Current</Badge>}
          <time
            dateTime={new Date(revision.timestamp).toISOString()}
            className="ml-auto text-[10px] text-fg-subtle"
          >
            {revisionDateFormatter.format(revision.timestamp)}
          </time>
        </div>

        <div className="mt-2.5 space-y-2">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-fg-subtle">
              Why it changed
            </div>
            <p className="mt-0.5 text-xs leading-relaxed text-fg">
              {revision.reason}
            </p>
          </div>
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-fg-subtle">
              What changed
            </div>
            <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">
              {revision.changeSummary}
            </p>
          </div>
        </div>

        {revision.changedPhases.length > 0 && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1 border-t border-border/50 pt-2">
            <span className="mr-0.5 text-[10px] text-fg-subtle">Changed</span>
            {revision.changedPhases.map((phaseIndex) => (
              <Badge key={phaseIndex} className="normal-case tracking-normal">
                Phase {phaseIndex + 1}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function RevisionPopover({ plan }: RevisionPopoverProps) {
  const revisions = [...plan.revisions].reverse();

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button
          variant="outline"
          size="sm"
          icon={History}
          aria-label={`View ${revisions.length} plan ${revisions.length === 1 ? 'revision' : 'revisions'}`}
          className="bg-elevated-1/50"
        >
          History
          <Badge variant="accent" className="ml-0.5 rounded-full px-1.5 py-0">
            v{plan.version}
          </Badge>
        </Button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          side="top"
          align="end"
          sideOffset={8}
          collisionPadding={12}
          aria-label="Plan revision history"
          className="z-50 flex max-h-[min(30rem,calc(100vh-6rem))] w-[min(28rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-border bg-panel shadow-2xl outline-none animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="flex shrink-0 items-start gap-3 border-b border-border px-4 py-3">
            <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent">
              <History className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-fg">Revision history</h3>
              <p className="mt-0.5 text-xs text-fg-subtle">
                {revisions.length} {revisions.length === 1 ? 'update' : 'updates'} · Current version {plan.version}
              </p>
            </div>
            <Popover.Close asChild>
              <IconButton icon={X} label="Close revision history" tooltipSide="left" />
            </Popover.Close>
          </div>

          <div className="scroll-thin min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {revisions.map((revision, index) => (
              <RevisionEntry
                key={`${revision.version}-${revision.timestamp}`}
                revision={revision}
                current={index === 0}
                last={index === revisions.length - 1}
              />
            ))}
          </div>

          <div className="shrink-0 border-t border-border bg-elevated-1/30 px-4 py-2 text-[10px] text-fg-subtle">
            Showing newest changes first · Original plan was v1
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
