import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SkillAvatar } from '../SkillAvatar';
import { SkillMenu } from '../SkillMenu';
import type { LoadedSkill } from '@/lib/electron';

interface SkillHeaderProps {
  skill: LoadedSkill;
  mention: string;
  copied: boolean;
  onCopyMention: () => void;
  onAfterDelete?: () => void;
}

export function SkillHeader({
  skill,
  mention,
  copied,
  onCopyMention,
  onAfterDelete,
}: SkillHeaderProps) {
  return (
    <header className="flex h-10 shrink-0 items-center gap-3 border-b border-border px-4">
      <SkillAvatar skill={skill} size="sm" />
      <span className="truncate text-sm font-medium text-fg">
        {skill.metadata.name}
      </span>
      <div className="flex-1" />
      <button
        type="button"
        onClick={onCopyMention}
        title="Copy mention to clipboard"
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-panel/40 px-2 py-1 font-mono text-[11px]',
          copied ? 'text-emerald-300' : 'text-fg-muted hover:bg-elevated hover:text-fg',
        )}
      >
        {copied ? (
          <Check className="h-3 w-3" strokeWidth={2} />
        ) : (
          <Copy className="h-3 w-3" strokeWidth={2} />
        )}{' '}
        {mention}
      </button>
      <SkillMenu skill={skill} variant="header" onAfterDelete={onAfterDelete} />
    </header>
  );
}
