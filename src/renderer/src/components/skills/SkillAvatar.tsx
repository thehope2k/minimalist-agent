// Skill icon — emoji, downloaded image, or generated initial.
//
// `metadata.icon` may be:
//   - an emoji  → rendered directly
//   - a URL     → main downloads it on first load; rendered from `iconPath`
//   - undefined → fall back to a colored circle with the first letter

import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LoadedSkill } from '@/lib/electron';

const SIZE_CLASSES = {
  sm: 'h-6 w-6 text-[12px]',
  md: 'h-8 w-8 text-sm',
  lg: 'h-10 w-10 text-base',
} as const;

const ICON_SIZE = { sm: 12, md: 14, lg: 18 } as const;

const EMOJI_RE = /^\p{Extended_Pictographic}/u;

export function SkillAvatar({
  skill,
  size = 'md',
  className,
}: {
  skill: Pick<LoadedSkill, 'metadata' | 'iconPath'>;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const dim = SIZE_CLASSES[size];
  const icon = skill.metadata.icon;

  // 1. Local downloaded icon file — render via file:// URL.
  if (skill.iconPath) {
    return (
      <img
        src={`file://${skill.iconPath}`}
        alt=""
        className={cn(
          'shrink-0 rounded-md object-cover',
          dim,
          className,
        )}
      />
    );
  }

  // 2. Emoji icon.
  if (icon && EMOJI_RE.test(icon)) {
    return (
      <span
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-md bg-elevated/60',
          dim,
          className,
        )}
        aria-hidden
      >
        {icon}
      </span>
    );
  }

  // 3. Fallback — sparkles icon on accent background.
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md bg-accent/15 text-accent',
        dim,
        className,
      )}
      aria-hidden
    >
      <Sparkles size={ICON_SIZE[size]} strokeWidth={1.75} />
    </span>
  );
}
