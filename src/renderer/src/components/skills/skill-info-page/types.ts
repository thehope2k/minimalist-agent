import type { LoadedSkill } from '@/lib/electron';
import type { SeedSubmit } from '@/App';

export type SkillInfoPageProps = {
  skill: LoadedSkill | null;
  onClose?: () => void;
  onStartChatWithSubmission?: (submit: SeedSubmit) => void;
  onOpenFile: (absolutePath: string, lineNumber: number) => void;
};

export interface KeyValueRow {
  label: string;
  /** Pre-rendered ReactNode so paths can be clickable. */
  value: React.ReactNode;
}
