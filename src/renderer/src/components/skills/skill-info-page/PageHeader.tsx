import type { LoadedSkill } from '@/lib/electron';
import { SkillAvatar } from '../SkillAvatar';

export function PageHeader({ skill }: { skill: LoadedSkill }) {
  return (
    <div className="flex items-start gap-3">
      <SkillAvatar skill={skill} size="lg" />
      <div className="min-w-0 flex-1">
        <h1 className="text-xl font-semibold text-fg">{skill.metadata.name}</h1>
        <p className="mt-0.5 text-sm text-fg-muted">
          {skill.metadata.description}
        </p>
      </div>
    </div>
  );
}
